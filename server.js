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
	  width: 450,
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


let hiddenWindow = new BrowserWindow({ width: 400, height: 400, show: util.isDev() })
hiddenWindow.openDevTools()

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
	host: config.aws.endpoint,
	debug: util.isDev(),
}

log.info(deviceOptions);
let device, thingShadows

createThing(_ => {
	device = awsiot.device({
		...deviceOptions,
		clientId: `sdk-nodejs-${getStatus().deviceid}-printerhost`,
	});

	if (util.isDev()) {
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
				log.info('error', error);
			});
	}
	device.subscribe(`printdesk/${thingName}/print`);
	device.on('message', function (topic, payload) {
		log.info(topic);
		log.info(payload);

		payload = JSON.parse(payload);
		configtoken = store.get('apitoken', '');
		if (payload.apitoken != configtoken) {
			log.info({ msg: 'apitoken mismatch', 'payload': payload.apitoken, 'config': configtoken });
			return;
		}
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
					//res.send(error);
					//res.status(500).end();
				} else {
					fs.writeFileSync(pdfTmpName, data);
					printPDF(pdfTmpName, payload.data.printer, payload.data.printerOptions).then(status => {
						//res.send(status);
						//res.end();
					}).catch(status => {
						//res.status(500).end();
					}).finally(status => {
						device.publish(`printdesk/${thingName}/callback`, JSON.stringify({ callbackid: payload.callbackid }));
					});
				}
			});
		});
	});

	thingShadows = awsiot.thingShadow({
		...deviceOptions,
		clientId: `sdk-nodejs-${getStatus().deviceid}-shadow`,
	});
	thingShadows.on('connect', function () {
		thingShadows.register(thingName, {
			ignoreDeltas: false
		}, function () {

			const sendShadow = _ => {
				clientTokenUpdate = thingShadows.update(thingName, {
					'state': { 'reported': getStatus() }
				});
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
})

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
		if (res.statusCode == 401) {
			/* retry login */
			promptLogin().then(_=> {
				createThing(callback);
			})
			return
		}
		if (error) {
			log.error(error.status)
			return
		}
		log.info(body);

		if (body.data.isNewThing) {
			fs.mkdirSync(certDir, { recursive: true });
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
			cmd = `${sumatra} -print-to "${printer.name}" -print-settings "${options.copies || 1}x" ${options.cmdArguments || ''} "${filename}"`;
			break;
		default:
			throw new Error(
				'Platform not supported.'
			);
	}
	log.info(cmd);
	return cmdPromise(cmd);
}

