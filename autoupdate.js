const log = require('electron-log');
const electron = require('electron')

require('update-electron-app')({
	logger: log,
	updateInterval: '5 minutes',
	repo: 'amatzen/printdesk',
})

electron.autoUpdater.once('update-downloaded', (ev, err) => {
	log.info('App updated');
	log.info(ev)
	err && log.error(err)
	electron.autoUpdater.quitAndInstall();
})

electron.autoUpdater.once('checking-for-update', (ev) => {
	log.info('checking-for-update');
	log.info(ev)
})

electron.autoUpdater.once('error', (error) => {
	log.error('Auto update error');
	log.error(error)
})
