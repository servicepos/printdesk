# How to release


# Test
- Dont publish your test version
- create a version without auto update. 
- Increment package.json version number with autoupdate `1.x.y-no-autoupdate`
- remove `require('./autoupdate')` from `main.js`
- push to master
- Wait for workflows to finish https://github.com/servicepos/printdesk/actions
- Test draft release https://github.com/servicepos/printdesk/releases by manually downloading an installing on WIN and MacOS
- **Dont publish this release**
- Please clean up master

# Release
- Increment package.json version number `1.x.y`
- Make sure auto update is activated. Check `require('./autoupdate')` can be seen in `main.js`
- push to master
- Wait for workflows to finish https://github.com/servicepos/printdesk/actions
- Publish draft release in  https://github.com/servicepos/printdesk/releases
	
