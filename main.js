const { app, Tray, Menu } = require('electron')
const os = require('os');
const path = require('path')
const util = require(path.join(__dirname, 'util.js'));
let iconpath;
if (os.platform() === 'win32')
  iconpath = path.join(__dirname, 'assets', 'servicepos.ico')
else
  iconpath = path.join(__dirname, 'assets', 'servicepos.png')

if (require('electron-squirrel-startup')) return app.quit();
require('./autoupdate')
require('./autolauncher');

let tray = null
function createWindow() {

  tray = new Tray(iconpath)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'ServicePOS', enabled: false,
    },
    {
      label: 'Quit', click: function () {
        app.isQuiting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
  if (util.isDev() == false && os.platform() === 'darwin') app.dock.hide();
  require('./server.js');
}



// // This method will be called when Electron has finished
// // initialization and is ready to create browser windows.
// // Some APIs can only be used after this event occurs.
app.on('ready', createWindow)


/*win.on('close', function (event) {
  win = null
})

win.on('minimize', function (event) {
  event.preventDefault()
  win.hide()
})

win.on('show', function () {
  appIcon.setHighlightMode('always')
})*/




// // Quit when all windows are closed.
// app.on('window-all-closed', function () {
//   // On macOS it is common for applications and their menu bar
//   // to stay active until the user quits explicitly with Cmd + Q
//   if (process.platform !== 'darwin') app.quit()
// })

// app.on('activate', function () {
//   // On macOS it's common to re-create a window in the app when the
//   // dock icon is clicked and there are no other windows open.
//   if (mainWindow === null) createWindow()
// })

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
