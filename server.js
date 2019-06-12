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
const awsiot = require('aws-iot-device-sdk');
const Store = require('electron-store');
const store = new Store();
const prompt = require('electron-prompt');

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
	  .then((r) => {
		log.info(r);
		store.set('apitoken', r);
		return r;
	  })
	  .catch(log.error);
  }

/* make global so it is never garbage collected */
const hiddenWindow = new BrowserWindow({ width: 400, height: 400, show: util.isDev() })
if (util.isDev()) {
	hiddenWindow.openDevTools()
}


let device, thingShadows

const certDir = path.join(app.getPath('userData'), 'certificates');
const publicKeyFile = path.join(certDir, 'cer.public.key');
const thingName = getStatus().deviceid;
const deviceOptions = {
	keyPath: path.join(certDir, 'cer.private.key'),
	certPath: path.join(certDir, 'cer.cert.pem'),
	caPath: path.join(__dirname, 'cert', 'root-CA.crt'),
	baseReconnectTimeMs: 4000,
	keepalive: 300,
	protocol: 'mqtts',
	enableMetrics : false,
	host: config.aws.endpoint,
	debug: util.isDev(),
}

log.info(deviceOptions);
createThing(_ => {
	device = awsiot.device({
		...deviceOptions,
		clientId: `sdk-nodejs-${getStatus().deviceid}-printerhost`,
	});

	device
		.on('connect', function () {
			log.info('connect');
		});
	device
		.on('close', function () {
			log.info('close');
		});
	device
		.on('reconnect', function () {
			log.info('reconnect');
		});
	device
		.on('offline', function () {
			log.info('offline');
		});
	device
		.on('error', function (error) {
			log.error('error', error);
		});

	device.subscribe(`printdesk/${thingName}/print`);
	device.on('message', function (topic, payloadJSON) {
		const payload = JSON.parse(payloadJSON);
		const configtoken = store.get('apitoken', '');
		if (payload.apitoken != configtoken) {
			log.error({ msg: 'apitoken mismatch. Deleting saved tokren and relaunchen app. This will make the app prompt for a new token', 'payload': payload.apitoken, 'config': configtoken });
			store.set('apitoken', '');
			app.relaunch()
			app.exit()
			return;
		}
		switch (topic) {
			case `printdesk/${thingName}/print`:
				handlePrint(payload);
				break;
			default:
				log.error('We do not know to handle this topic');
		}
	});
	registerShahowHandlers();
})

function handlePrint(payload) {
	const pdfTmpName = `${tmp.fileSync().name}.pdf`;
	const htmlTmpName = `${tmp.fileSync().name}.html`;
	fs.writeFileSync(htmlTmpName, payload.data.html);
	/*  windows are closed() with the garabage collector */
	const tmpWindow = new BrowserWindow({ width: 400, height: 400, show: false })
	tmpWindow.loadURL(`file://${htmlTmpName}`);
	tmpWindow.webContents.on('did-finish-load', () => {
		tmpWindow.webContents.printToPDF(payload.data.pdfOptions, (error, data) => {
			log.info(payload.data.pdfOptions);
			if (error) {
				log.error(error);
			} else {
				fs.writeFileSync(pdfTmpName, data);
				printPDF(pdfTmpName, payload.data.printer, payload.data.printerOptions).then(status => {
				}).catch(status => {
				}).finally(status => {
					pushCallback(payload.callbackid, {});
				});
			}
		});
	});
}

function registerShahowHandlers() {
	thingShadows = awsiot.thingShadow({
		...deviceOptions,
		clientId: `sdk-nodejs-${getStatus().deviceid}-shadow`,
	});
	thingShadows.on('connect', function () {
		thingShadows.register(thingName, {
			ignoreDeltas: false
		}, function () {

			const sendShadow = _ => {
				/* windows do not exist when app is quitting. We canno send status without windows */
				if (hiddenWindow) {
					clientTokenUpdate = thingShadows.update(thingName, {
						'state': { 'reported': getStatus() }
					});
				}
			};

			sendShadow();
			setInterval(sendShadow, 5000);
		});
	});
	thingShadows.on('timeout',
		function (thingName, clientToken) {
			log.info('received timeout on ' + thingName +
				' with token: ' + clientToken);
		});
}

function pushCallback(callbackid, payload) {
	const topic = `printdesk/${thingName}/callback`;
	log.info(topic)
	device.publish(topic, JSON.stringify({ callbackid, payload }));
}

function createThing(callback) {
	const hasCertificate = fs.existsSync(deviceOptions.certPath) && fs.existsSync(deviceOptions.keyPath) && fs.existsSync(publicKeyFile);
	const apitoken = store.get('apitoken', '');
	var headers = {
		'apitoken': apitoken,
	};
	request.post(`${config.servicepos_url}/webbackend/index.php`, {
		json: {
			data: { status: getStatus(), forceNew : !hasCertificate, },
			lib: 'PrintDesk',
			method: 'createThing'
		},
		headers,
	}, (error, res, body) => {
		log.info(body);
		log.info(res);
		if (error) {
			log.error(error)
			log.info('retrying in 5 seconds')
			setTimeout(_ => createThing(callback), 5000);
			return
		}
		if (res.statusCode == 401) {
			/* retry login */
			promptLogin().then(_=> {
				createThing(callback);
			})
			return
		}

		if (body.data.isNewThing) {
			fs.existsSync(certDir) || fs.mkdirSync(certDir, { recursive: true });
			fs.writeFileSync(deviceOptions.certPath, body.data.certificate.certificatePem, { flag: 'w' })
			fs.writeFileSync(deviceOptions.keyPath, body.data.certificate.keyPair.PrivateKey, { flag: 'w' })
			fs.writeFileSync(publicKeyFile, body.data.certificate.keyPair.PublicKey, { flag: 'w' })
		}
		log.info(`statusCode: ${res.statusCode}`)
		callback();
	})
}

function getStatus() {
	const printers = hiddenWindow.webContents.getPrinters();
	const platform = os.platform();
	const deviceid = machineid.machineIdSync({ original: true })
	const ts = (new Date()).toISOString()
	const hostname = os.hostname()

	return {
		printers,
		platform,
		deviceid,
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

