const cmdPromise = require('cmd-promise')
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
const server = express();
const Store = require('electron-store');
const store = new Store();
const prompt = require('electron-prompt');
const ipmodule = require("ip");
const port = 43594;
const bamdesk = require('./bamdesk.js');
const pdftrim = require('./pdftrim');

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

	server.use(express.json()); // for parsing application/json
	server.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

	server.post('/print', function (req, res) {
		if (isQuitting()) {
			const msg = "app is quitting";
			log.error(msg)
			res.status(500);
			res.send({ paylod: msg });
			return;
		}
		log.info(req);
		const payload = req.body.payload;
		const pdfTmpName = `${tmp.fileSync().name}.pdf`;
		const htmlTmpName = `${tmp.fileSync().name}.html`;
		fs.writeFileSync(htmlTmpName, payload.html);
		let pdfWindow = new BrowserWindow({ width: 400, height: 400, show: false })
		pdfWindow.webContents.session.clearCache(_ => { });
		/* windows are closed upon garbage collection */
		pdfWindow.loadURL(`file://${htmlTmpName}`, { "extraHeaders": "pragma: no-cache\n" });
		pdfWindow.webContents.on('did-finish-load', () => {
			log.info(payload.pdfOptions);
			pdfWindow.webContents.printToPDF(payload.pdfOptions, (error, pdf) => {
				log.info('pdf generated');
				if (error) {
					log.error(error);
					res.status(500)
					res.send({ payload: error, msg: 'could not generate pdf' });
				} else {
					fs.writeFileSync(pdfTmpName, pdf);

					if (deviceStatus.featureFlags["printdesk_trimPDF"]) {
						const yMargin = 5; // XXX receive this from input?
						pdftrim.trimHeight(pdfTmpName, yMargin);
					}

					printPDF(pdfTmpName, payload.printer, payload.printerOptions).then(status => {
						log.info(status);
						res.send({ payload: status });
					}).catch(status => {
						log.error(status);
						res.status(500)
						res.send({ payload: status, msg: 'could not print' });
					});
				}
			});
		});
	})

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
		label: 'Apitoken (Settings->API)',
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
				bamdesk.keepAlive(body.data.bamdeskdevice);
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

// https://stackoverflow.com/questions/49650784/printing-a-pdf-file-with-electron-js
function printPDF(filename, printer, options) {
	let cmd;
	log.info(options);
	switch (os.platform()) {
		case 'darwin':
		case 'linux':
			cmd = `lp "${filename}" -d "${printer.name}" -n ${options.copies || 1} ${options.cmdArguments || ''}`;
			break
		case 'win32':
			if (deviceStatus.featureFlags["printdesk_PDFtoPrinter"]) {
				const pdfToPrinter = path.join(__dirname, 'assets', 'PDFToPrinter.exe').replace('app.asar', 'app.asar.unpacked')
				cmd = `"${pdfToPrinter}" "${filename}" "${printer.name}"`;
			} else {
				const sumatra = path.join(__dirname, 'assets', 'SumatraPDF.exe').replace('app.asar', 'app.asar.unpacked')
				args = options.cmdArguments || `-print-settings "${options.copies || 1}x,noscale"`
				cmd = `"${sumatra}" -print-to "${printer.name}" ${args} "${filename}"`;
			}
			break;
		default:
			log.error('Platform not supported.');
	}
	log.info({cmd});
	return cmdPromise(cmd);
}

function isQuitting() {
	return !hiddenWindow || !hiddenWindow.webContents || hiddenWindow.webContents.isDestroyed();
}

module.exports = {
	run
}