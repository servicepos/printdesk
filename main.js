const { app } = require('electron')
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

/* single instance production mode */
if (app.requestSingleInstanceLock() == false) {
  log.info('Another instance is running. Quitting...')
  app.quit();
} else {
  // // This method will be called when Electron has finished
  // // initialization and is ready to create browser windows.
  // // Some APIs can only be used after this event occurs.
  app.on('ready', createWindow)
}
