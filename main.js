const { app, crashReporter } = require('electron')
const os = require('os');
const isDev = require('electron-is-dev');
const log = require('electron-log')
const server = require('./server.js');

if (require('electron-squirrel-startup')) return app.quit();
require('./autoupdate')
require('./autolauncher');

function createWindow() {

  if (isDev == false && os.platform() === 'darwin') app.dock.hide();
  server.run();
}

crashReporter.start({
  productName: "Printdesk",
  companyName: "ServicePOS",
  submitURL: "",
  uploadToServer: false,
})

/* single instance production mode */
if (app.requestSingleInstanceLock() == false) {
  log.info('Another instance is running. Quitting...')
  app.quit();
} else {

  // // This method will be called when Electron has finished
  // // initialization and is ready to create browser windows.
  // // Some APIs can only be used after this event occurs.
  app.on('ready', createWindow)



// This will catch clicks on links such as <a href="foobar://abc=1">open in foobar</a>
  app.on('open-url', function (event, data) {
    event.preventDefault();
  });

  app.setAsDefaultProtocolClient('printdesk');
}
