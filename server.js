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

let hiddenWindow;
let iconpath;
let tray;
let deviceStatus;


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
		const pdfWindow = new BrowserWindow({width: 400, height: 400, show: false, javascript : false, webPreferences : { worldSafeExecuteJavaScript: true }})
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
		store.set('apitoken', payload);
		res.status(200);
		res.send();
	})


	server.listen(port, () => log.info(`listening on port ${port}!`))

	pushStatus(true);
	setInterval(pushStatus, 10000);
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

function pushStatus(askForToken) {

	if (isQuitting()) {
		log.info("status not send due to app quitting")
		return;
	}

	const apitoken = store.get('apitoken');

	if (!apitoken) {
		log.info("apitoken not set")
		return;
	}

	const headers = { 'apitoken': apitoken };
	request.post(`${config.servicepos_url}/webbackend/index.php`, {
		json: {
			data: { status: getStatus() },
			lib: 'PrintDesk',
			method: 'deviceStatus',
		},
		headers,
	}, (error, res, body) => {
		if (res && res.statusCode == 200) {
			log.info('pulled status', body.data);
			setTrayMenu(body.data);
			if (body.data) {
				deviceStatus = body.data;
				bamdesk.keepAlive(body.data.bamdeskdevice, body.data.featureFlags);
			}
		} else if (res && res.statusCode == 401 && askForToken) {
			/* retry login */
			promptLogin().then(_ => {
				pushStatus(askForToken);
			})
			return
		}
		if (error) {
			log.error(error)
			return
		}
	})
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
