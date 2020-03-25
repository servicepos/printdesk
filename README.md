# You can publish if you wanna
`export CSC_LINK=~/codesigningcertificate.pfx`
`export CSC_KEY_PASSWORD=pw`

Please be sure everything works. Payment devices will break and all hell will break loose if Printdesk does not work.

- Get certifcates from Google Drive
- Update version no in package.json
- `yarn run publish`
- Goto https://github.com/servicepos/printdesk/releases and test the build
- When sure everything works: publish draft release at (click edit). Printdesk will now slowly auto update.
- To rollback mark the lastest release as prerelease. Autoupdate rollback can take hours. Happy phoning! :D 