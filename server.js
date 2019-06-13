const cmdPromise = require('cmd-promise')
const tmp = require('tmp');
const fs = require('fs');
const os = require('os');
const { app } = require('electron')
const path = require('path')
const log = require('electron-log');
const request = require('request')
const util = require(path.join(__dirname, 'util.js'));
const config = util.isDev() ? require(path.join(__dirname, 'config-dev.json')) : require(path.join(__dirname, 'config.json'));
const { BrowserWindow } = require('electron')
const machineid = require('node-machine-id');
const express = require('express');
const server = express();
var cors = require('cors')
const Store = require('electron-store');
const store = new Store();
const prompt = require('electron-prompt');
const port = 43594;
/* make global so it is never garbage collected */
const hiddenWindow = new BrowserWindow({ width: 400, height: 400, show: util.isDev() })
if (util.isDev()) {
	hiddenWindow.openDevTools()
}



log.info(`is dev ${util.isDev()}`)

//server.use(express.json()); // for parsing application/json
server.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
server.use(cors())

server.use(function(req, res, next) {
	res.set('Content-type', 'text/javascript');
    next();
});

server.get('/print', function (req, res) {

	if (isQuitting()) {
		const msg = "app is quitting";
		log.error(msg)
		res.status(500);
		res.jsonp({ paylod: msg });
		return;
	}
	log.info('post print');
	const payload = req.query.payload;
	const pdfTmpName = `${tmp.fileSync().name}.pdf`;
	const htmlTmpName = `${tmp.fileSync().name}.html`;
	fs.writeFileSync(htmlTmpName, payload.html);
	let pdfWindow = new BrowserWindow({ width: 400, height: 400, show: false })
	/* windows are closed upon garbage collection */
	pdfWindow.loadURL(`file://${htmlTmpName}`);
	pdfWindow.webContents.on('did-finish-load', () => {
		log.info(payload.pdfOptions);
		pdfWindow.webContents.printToPDF(payload.pdfOptions, (error, pdf) => {
			log.info('pdf generated');
			if (error) {
				log.error(error);
				res.status(500)
				res.jsonp({ payload: error, msg : 'could not generate pdf' });
			} else {
				fs.writeFileSync(pdfTmpName, pdf);
				printPDF(pdfTmpName, payload.printer, payload.printerOptions).then(status => {
					log.info(status);
					res.jsonp({ payload: status });
				}).catch(status => {
					log.error(status);
					res.status(500)
					res.jsonp({ payload: status, msg : 'could not print'});
				});
			}
		});
	});
})

server.get('/status', function (req, res) {
	try {
		if (isQuitting()) throw "app is quitting"
		const status = getStatus();
		res.jsonp({ payload: status });
	} catch (e) {
		res.status(500);
		res.jsonp({ paylod: res });
	}
});

server.get('/log', function (req, res) {
	try {
		const status = getStatus();
		res.jsonp({ payload: status });
	} catch (e) {
		res.jsonp(500);
		res.jsonp({ paylod: e });
	}
});

server.listen(port, () => log.info(`listening on port ${port}!`))

pushStatus(true);
setInterval(pushStatus, 5000);

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
			if(r === null) {
				app.quit();
			} else {
				log.info(r);
				store.set('apitoken', r);
				return r;
			}
		})
		.catch(log.error);
}

function pushStatus(askForToken) {

	if (isQuitting()) {
		return;
	}

	const apitoken = store.get('apitoken', '');
	const headers = {
		'apitoken': apitoken,
	};
	request.post(`${config.servicepos_url}/webbackend/index.php`, {
	  json: {
		data : {status : getStatus() },
		lib : 'PrintDesk',
		method : 'deviceStatus',
	  },
	  headers,
	}, (error, res, body) => {
		log.info(body)
		if (res && res.statusCode == 401 && askForToken) {
			/* retry login */
			log.error('Retrying apikey');
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
	const printers = hiddenWindow.webContents.getPrinters();
	const platform = os.platform();
	const deviceid = machineid.machineIdSync({ original: true })
	const ts = (new Date()).toISOString()
	const interfaces = os.networkInterfaces();
	const hostname = os.hostname()

	return {
		printers,
		platform,
		deviceid,
		interfaces,
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
			break;
		case 'win32':
			const sumatra = path.join(__dirname, 'assets', 'SumatraPDF.exe').replace('app.asar', 'app.asar.unpacked')
			args = options.cmdArguments || `-print-settings "${options.copies || 1}x,noscale"`
			cmd = `${sumatra} -print-to "${printer.name}" ${args} "${filename}"`;
			break;
		default:
			log.error('Platform not supported.');
	}
	log.info(cmd);
	return cmdPromise(cmd);
}

function isQuitting() {
	return !(hiddenWindow && hiddenWindow.webContents && hiddenWindow.webContents.isDestroyed() == false)
}

