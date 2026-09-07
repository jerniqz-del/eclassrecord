const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const colors = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'theme', 'Color.kt');
const theme = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'theme', 'Theme.kt');
const design = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'design', 'MobileDesignSystem.kt');
const academic = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'AcademicWorkspace.kt');
const shell = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'main', 'PremiumMainScreen.kt');

[
  'NeonPurple = Color(0xFFA855F7)',
  'NeonBlue = Color(0xFF2F8FFF)',
  'NeonGreen = Color(0xFF22C55E)',
  'NeonPanel = Color(0xFF080C15)',
  'NeonPanelRaised = Color(0xFF0D1320)',
].forEach(token => assert(colors.includes(token), 'Missing dark-neon token: ' + token));

assert(theme.includes('darkTheme: Boolean = false'), 'Light mode must be the default.');
assert(theme.includes('data class ThemeController'));
assert(theme.includes('LocalThemeController'));
assert(theme.includes('primary = NeonPurple'));
assert(theme.includes('secondary = NeonBlue'));
assert(theme.includes('tertiary = NeonGreen'));
assert(design.includes('listOf(NeonPurple, NeonBlue, NeonGreen)'));
assert(design.includes('fun themePanel'));
assert(design.includes('Icons.Default.DarkMode'));
assert(design.includes('showThemeToggle'));

const fluid = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'design', 'FluidLayout.kt');
assert(fluid.includes('val typeScale'));
assert(fluid.includes('val cardMaxWidth'));
assert(fluid.includes('val cornerRadius'));
assert(fluid.includes('val mediaHeight'));
assert(fluid.includes('val gutter'));
assert(fluid.includes('val columns'));
assert(fluid.includes('fun phonePortrait()'));
assert(fluid.includes('fun phoneLandscape()'));
assert(fluid.includes('fun tabletPortrait()'));
assert(fluid.includes('fun tabletLandscape()'));
assert(fluid.includes('useRailNavigation'));

assert(academic.includes('border = BorderStroke(1.dp, NeonPurple.copy(alpha = .68f))'), 'Calendar hero should use the purple neon frame.');
assert(academic.includes('border = BorderStroke(1.dp, NeonGreen.copy(alpha = .65f))'), 'Attendance hero should use the green neon frame.');
assert(academic.includes('SubjectVisuals.forAssignment(assignment).color.copy(alpha = .48f)'), 'Attendance controls should retain desktop subject color.');
assert(academic.includes('SubjectIconTile(assignment'), 'Class and grading cards should retain transparent subject icons.');
assert(academic.includes('colors = ButtonDefaults.buttonColors(containerColor = NeonGreen'), 'Attendance primary action should be green.');

assert(shell.includes('border = BorderStroke(1.dp, NeonPurple.copy(alpha = .30f))'), 'Navigation dock should use a subtle purple frame.');
assert(shell.includes('0 -> NeonPurple'));
assert(shell.includes('1 -> NeonBlue'));
assert(shell.includes('else -> NeonGreen'));
assert(shell.includes('containerColor = themePanel(raised = true)'), 'Alerts should follow the active light or dark panel.');
assert(shell.includes('fun PersistentAppRail'), 'Tablets and landscape phones should use a side rail.');
assert(shell.includes('Dark mode'));
assert(design.includes('fun NeonCard'), 'Shared neon cards should live in the design system.');
assert(design.includes('fun SearchField'), 'Search fields should share the same neon outline.');
assert(design.includes('fun RemoteToolChip'), 'Desktop remote tools should use compact chips instead of stacked full-width buttons.');

const sync = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'SyncScreen.kt');
assert(!sync.includes('0xFFE8F5E9'), 'Wi-Fi connection cards must not use light mint backgrounds on the dark theme.');
assert(!sync.includes('0xFFDDF7E5'), 'Link meters must not use light mint panels on the dark theme.');
assert(sync.includes('NeonGreen.copy(alpha = 0.55f)'), 'Connected Wi-Fi cards should use a neon green frame.');

const pin = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'MobilePinUnlockScreen.kt');
assert(pin.includes('BrandDepthGradient'), 'The PIN lock screen should use the shared brand gradient.');
assert(pin.includes('same six-digit PIN used on the desktop'));

console.log('Dark-neon Android theme and academic component styling validated.');
