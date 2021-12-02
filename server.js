const tmp = require('tmp');
const fs = require('fs');
const os = require('os');
const { app, Tray, Menu } = require('electron')
const path = require('path')
const log = require('electron-log');
const request = require('request')
const isDev = require('electron-is-dev');
const config = isDev ? require(path.join(__dirname, 'config-dev.json')) : require(path.join(__dirname, 'config.json'));
const { BrowserWindow } = require('electron')
const machineid = require('node-machine-id');
const express = require('express');
const bodyParser = require('body-parser');
const server = express();
const Store = require('electron-store');
const store = new Store();
const prompt = require('electron-prompt');
const ipmodule = require("ip");
const port = 43594;
const bamdesk = require('./bamdesk.js');
const openExplorer = require('open-file-explorer');
const crashReporter = require('electron').crashReporter;
const fetch = require('electron-fetch').default; 

let hiddenWindow;
let iconpath;
let tray;
let lastSettingsReceivedTime = 0;
let lastPushedPrinterTime = 0;

if (os.platform() === 'win32')
  iconpath = path.join(__dirname, 'assets', 'servicepos.ico')
else
  iconpath = path.join(__dirname, 'assets', 'servicepos_16x16.png')

function setTrayMenu(status) {
  const items = [
    {
      label :`ServicePOS ${app.getVersion()}`,
      enabled : false
    }
  ];


  if (status) {
	crashReporter.addExtraParameter("Store_title", status.store.title);
	crashReporter.addExtraParameter("Store_id", status.store.id.toString());
    items.push({
      label :`User: ${status.store.title}`,
      enabled : false
    })

    if (status.bamdeskdevice) {
      items.push({
        label :`Terminal: ${status.bamdeskdevice.title}`,
        enabled : false
      })
    }
  } else {
    items.push({
      label :`Logging in...`,
      enabled : false
    })
  }
	items.push({
		label :`View log`,
		enabled : true,
		click : _ => {
			const logFile = log.transports.file.file;
			const logPath = path.dirname(logFile);
			openExplorer(logPath,  err=> {
				if(err) {
					log.error(err);
				}
			});
		}
	})
	items.push({
		label :`View crash dumps`,
		enabled : true,
		click : _ => {
			openExplorer(app.getPath('crashDumps'),  err=> {
				if(err) {
					log.error(err);
				}
			});
		}
	})
  const contextMenu = Menu.buildFromTemplate(items);
  tray.setContextMenu(contextMenu)
}

function run() {
	/* make global so it is never garbage collected */
	hiddenWindow = new BrowserWindow({ width: 400, height: 400, show: isDev })

	if (isDev) {
		hiddenWindow.openDevTools()
	}

	tray = new Tray(iconpath)
	setTrayMenu(null);

	server.use(function (req, res, next) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
		next();
	});

	log.info(`is dev ${isDev}`)

	server.use(bodyParser.json({limit: '50mb'}));
	server.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

	server.use(express.json()); // for parsing application/json
	server.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

	server.post('/print', async function (req, res) {
		if (isQuitting()) {
			const msg = "app is quitting";
			log.error(msg)
			res.status(500);
			res.send({paylod: msg});
			return;
		}
		const payload = req.body.payload;
		const pdfTmpName = `${tmp.fileSync().name}.pdf`;
		const htmlTmpName = `${tmp.fileSync().name}.html`;
		fs.writeFileSync(htmlTmpName, payload.html);
		const pdfWindow = new BrowserWindow({width: 400, height: 400, show : false, webPreferences : { javascript : false, worldSafeExecuteJavaScript: true }})
		await pdfWindow.loadURL(`file://${htmlTmpName}`, {"extraHeaders": "pragma: no-cache\n"});
		log.info(payload.pdfOptions);
		log.info(payload.printer);
		log.info('Print with chrome')
		const marginType = payload.pdfOptions.marginType == 0 ? 'default' : 'none';
		let options = {
			...payload.pdfOptions,
			silent: true,
			printBackground: false,
			margins : {
				marginType,
			},
			deviceName: payload.printer.name,
		}
		log.info({options});

		pdfWindow.webContents.print(options, function(success, failureReason) {
			pdfWindow.close();
			if (success) {
				log.info('print ok');
				res.send({payload: 'ok'});
			} else {
				log.error(failureReason);
				res.status(500)
				res.send({payload: failureReason, msg: 'could not print'});
			}
		});

	});

	server.get('/status', function (req, res) {
		try {
			if (isQuitting()) throw "app is quitting"
			const status = getStatus();
			res.send({ payload: status });
		} catch (e) {
			res.status(500);
			res.send({ paylod: res });
		}
	});

	server.post('/apitoken', function (req, res) {
		const payload = req.body.payload;
		const currentApitoken = store.get('apitoken');

		if (currentApitoken != payload) {
			store.set('apitoken', payload);

			/* force refresh of printers and settings */
			lastSettingsReceivedTime = 0;
			settingsLastReceived = 0;
		}

		res.status(200);
		res.send();
	})


	server.listen(port, () => log.info(`listening on port ${port}!`))

	getStoreAndDeviceSettingsLoop();
	pushPrintersLoop();

}

async function getStoreAndDeviceSettingsLoop() {

	let storeSettings;
 
	while(true){
		const apitoken = store.get('apitoken');
		// Gets storesettings once every 5 minutes, in order to relax the endpoint
		// If we get an authorization error, we reset timer and try again when we get a new apitoken
		const refreshTooOldSettings = (lastSettingsReceivedTime + 5*60*1000) < new Date().getTime();
		if (apitoken && refreshTooOldSettings){
			const headers = { 'Authorization': 'Bearer ' + apitoken };
			const result = await fetch(`${config.servicepos_url}/api/settings`, {
				method: 'GET',
				headers,
			}).then((result) => {
				if (result && result.status == 200) {
					return result;
				}

				if (result && result.status == 401) {
					// removing apitoken since it is no longer valid
					store.set('apitoken', "");
					return null;
				}
			}).catch((err) => {
				log.info(err);
			});
			
			if (result) {
				storeSettings = await result.json();
				storeSettings.featureFlags = storeSettings.featureFlags.reduce((p, c) => {
					p[c.key] = c.value;
					return p;
				}, {});
				lastSettingsReceivedTime = new Date().getTime();
				setTrayMenu({store: storeSettings.store});
			} else {
				storeSettings = null;
			}
		}

		// Gets bamdesk device for the store
		if (apitoken && storeSettings){
			await getBamdeskDevice(storeSettings);
		}

		await sleep(10000);
	}

}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBamdeskDevice(storeSettings) {

	const status = getStatus();

	return fetch(`${config.bamdesk_url}/bamdesk/deviceInfo/${storeSettings.store.id}/${status.deviceid}`, {method: 'GET'})
		.then(res => res.json())
		.then((body) => {
			setTrayMenu({store: storeSettings.store, bamdeskdevice: body.id ? body : null});
	
			if (body) {
				log.info('pulled status', body);
				bamdesk.keepAlive(body.id ? body : null, storeSettings.featureFlags);
			}
		}).catch((err) => {
			log.error(err);
	});
}


async function pushPrintersLoop() {

	let lastPushedPrinterJSON = '';

	while(true){

		const apitoken = store.get('apitoken');

		const status = getStatus();
		const refreshDisconnectedPrinters = (lastPushedPrinterTime + 5*60*1000) < new Date().getTime();
		// strinify object in order to compare previous settings
		const statusJSON = JSON.stringify({...status, ts: null});
		// no reason to update prints if the current settings are the same as previous
		// but to be sure that disconnected printers are registered we force push printers each 5 mintues
		if (apitoken && (refreshDisconnectedPrinters || statusJSON != lastPushedPrinterJSON)){
			lastPushedPrinterJSON = statusJSON;

			const headers = { 'apitoken': apitoken };
			await fetch(`${config.servicepos_url}/webbackend/api/PrintDesk/pushPrinters`, {
				method: 'POST',
				body: JSON.stringify({status: status}),
				headers,
			}).then(res => {
				if (res && res.status == 200){
					lastPushedPrinterTime = new Date().getTime();
				}
				if (res && res.status == 401) {
					// relax - invalid apitoken
					store.set('apitoken', "");
				}
			}).catch(err => {
					log.error(err);
			});
		}

		await sleep(10000);
	}

}

function promptLogin() {
	return prompt({
		title: 'Apitoken',
		label: 'Apitoken (Settings->Users)',
		width: 550,
		height: 150,
		value: '',
		inputAttrs: {
			type: 'text', required: true
		}
	})
		.then(r => {
			if (r === null) {
				app.quit();
			} else {
				log.info(r);
				setApiToken(r);
				return r;
			}
		})
		.catch(log.error);
}

function getStatus() {
	const ip = ipmodule.address();
	const printers = hiddenWindow.webContents.getPrinters();
	const platform = os.platform();
	const deviceid = machineid.machineIdSync({ original: true })
	const ts = (new Date()).toISOString()
	const hostname = os.hostname()

	return {
		printers,
		platform,
		deviceid,
		ip,
		port,
		hostname,
		ts
	};
}

function isQuitting() {
	return !hiddenWindow || !hiddenWindow.webContents || hiddenWindow.webContents.isDestroyed();
}

module.exports = {
	run
}
