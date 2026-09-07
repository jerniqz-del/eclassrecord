const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const navigation = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'Navigation.kt');
const premium = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'main', 'PremiumMainScreen.kt');
const design = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'design', 'MobileDesignSystem.kt');
const sync = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'SyncScreen.kt');
const classDetail = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'ClassDetailScreen.kt');
const scoreEntry = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'ScoreEntryScreen.kt');
const desktopFeature = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'DesktopFeatureScreen.kt');
const markPath = path.join(root, 'android', 'app', 'src', 'main', 'res', 'drawable-nodpi', 'eclass_app_icon.png');

assert(fs.existsSync(markPath), 'The desktop-matching app emblem must ship in the Android project.');
const mark = fs.readFileSync(markPath);
assert.strictEqual(mark.subarray(1, 4).toString(), 'PNG');
assert(mark.length > 100_000, 'The app emblem should not be an empty placeholder.');

assert.match(design, /fun BrandMark/);
assert.match(design, /R\.drawable\.eclass_app_icon/);
assert.match(read('android', 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml'), /@color\/launcher_background/);
assert.match(read('android', 'app', 'src', 'main', 'res', 'drawable', 'ic_launcher_foreground.xml'), /@drawable\/eclass_app_icon/);
assert.match(design, /fun DepthIcon/);
assert.match(design, /fun EClassTopBar/);
assert.match(design, /LanSyncManager\.isUpdateReady/);
assert.match(design, /openReadyUpdatePrompt/);
assert.match(design, /Text\("Update"/);
assert.match(design, /E-Class Record App v\$version/);
assert.match(design, /getPackageInfo\(context\.packageName, 0\)\.versionName/);
assert.match(design, /fun NeonCard/);
assert.match(design, /BrandDepthGradient/);
assert.doesNotMatch(navigation, /PersistentMobileHeader/);
assert.match(navigation, /PersistentAppDock/);
assert.match(navigation, /PersistentAppRail/);
assert.match(navigation, /useRailNavigation/);
assert.match(premium, /AnimatedContent/);
assert.match(premium, /DepthIcon/);
assert.match(premium, /BrandMark\(size = fluid\.mediaHeight/);
assert.match(premium, /Reconnect desktop/);
assert.match(premium, /desktopLinked/);
assert.doesNotMatch(premium, /Connected by Wi-Fi/);
assert.match(premium, /Profile\("Profile"/);
assert.match(premium, /WorkspaceInsights/);
assert.match(premium, /CalendarEventEditorDialog/);
assert.match(premium, /indicatorColor = Color\.Transparent/);
assert.match(premium, /fun PersistentAppRail/);
assert.match(sync, /Wi-Fi \/ hotspot first/);
assert.match(sync, /DepthIcon/);
[classDetail, scoreEntry, desktopFeature].forEach((source) => assert.match(source, /EClassTopBar/));

console.log('Mobile 3D branding, navigation, transitions, and screen-wide design-system tests passed.');
