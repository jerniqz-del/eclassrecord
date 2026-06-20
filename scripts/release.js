/**
 * Release Automation Script
 * Bumps the version in package.json, commits, tags, pushes, and publishes to GitHub.
 * Also dynamically generates and writes changelog.js for the in-app Welcome modal.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packageJsonPath = path.join(__dirname, '../package.json');
const changelogFilePath = path.join(__dirname, '../src/renderer/js/changelog.js');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

// Determine next version (default to patch bump)
let nextVersion = process.argv[2];

if (!nextVersion) {
  const parts = currentVersion.split('.');
  if (parts.length === 3) {
    const patch = parseInt(parts[2], 10);
    parts[2] = (patch + 1).toString();
    nextVersion = parts.join('.');
  } else {
    console.error(`Error: Current version ${currentVersion} is not in semver format X.Y.Z`);
    process.exit(1);
  }
}

console.log(`Current version: ${currentVersion}`);
console.log(`Target next version: ${nextVersion}`);

function runCmd(cmd) {
  console.log(`Executing: ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Command failed: ${cmd}`);
    process.exit(1);
  }
}

// 1. Update package.json
packageJson.version = nextVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
console.log(`Updated package.json to version ${nextVersion}`);

// Helper to find a matching local Git tag for the Facebook version
function findGitTagForVersion(verStr) {
  if (!verStr || verStr.toLowerCase() === 'none') return null;
  const clean = verStr.replace(/^v/i, '').trim();
  const possibleTags = [`v${clean}`, clean];
  if (clean.split('.').length === 2) {
    possibleTags.push(`v${clean}.0`, `${clean}.0`);
  }
  
  try {
    const allTags = execSync('git tag', { encoding: 'utf8' }).split('\n').map(t => t.trim()).filter(Boolean);
    for (const t of possibleTags) {
      if (allTags.includes(t)) {
        return t;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// A. Scrape Facebook page for latest version tag
let lastFbVersion = 'none';
console.log('Checking Facebook page for the latest posted version...');
try {
  execSync('npx electron scripts/check-fb-post.js', { stdio: 'inherit' });
  const lastFbVersionPath = path.join(__dirname, '../dist/last-fb-version.txt');
  if (fs.existsSync(lastFbVersionPath)) {
    lastFbVersion = fs.readFileSync(lastFbVersionPath, 'utf8').trim();
    console.log(`Latest version posted on Facebook: ${lastFbVersion}`);
  }
} catch (err) {
  console.warn('Warning: Failed to check Facebook page. Falling back to default release behavior.', err.message);
}

// 2. Extract Git Changelog (for Welcome Modal - only current release changes)
let changelogList = [];
let changelogPointsStr = '';
let previousTag = null;
try {
  const tags = execSync('git tag --sort=-v:refname', { encoding: 'utf8' }).trim().split('\n');
  const currentTag = `v${nextVersion}`;
  previousTag = tags.find(t => t !== currentTag && (t.startsWith('v') || t.match(/^\d/)));
  
  if (previousTag) {
    const rawLog = execSync(`git log ${previousTag}..HEAD --oneline`, { encoding: 'utf8' }).trim();
    if (rawLog) {
      changelogList = rawLog.split('\n')
        .map(line => line.replace(/^[a-f0-9]+\s+/, '').trim())
        .filter(Boolean);
      changelogPointsStr = changelogList.map(line => '  • ' + line).join('\n');
    }
  }
} catch (e) {
  console.warn('Could not extract git history. Using fallback changelog.');
}

if (changelogList.length === 0) {
  changelogList = ['General performance improvements and minor security updates.'];
  changelogPointsStr = '  • General performance improvements and minor security updates.';
}

// B. Extract accumulated Git Changelog for Facebook (from the latest posted version up to HEAD)
let fbChangelogPointsStr = changelogPointsStr;
const fbBaseTag = findGitTagForVersion(lastFbVersion);
if (fbBaseTag) {
  if (fbBaseTag !== `v${nextVersion}`) {
    console.log(`Accumulating updates starting from Facebook's last posted version tag: ${fbBaseTag}...`);
    try {
      const rawFbLog = execSync(`git log ${fbBaseTag}..HEAD --oneline`, { encoding: 'utf8' }).trim();
      if (rawFbLog) {
        const fbChangelogList = rawFbLog.split('\n')
          .map(line => line.replace(/^[a-f0-9]+\s+/, '').trim())
          .filter(Boolean);
        fbChangelogPointsStr = fbChangelogList.map(line => '  • ' + line).join('\n');
      }
    } catch (e) {
      console.warn(`Could not extract accumulated git history since ${fbBaseTag}. Falling back to default changelog.`);
    }
  } else {
    console.log(`Facebook page is already up to date with version ${fbBaseTag}. Only including current changes.`);
  }
}

// 3. Write src/renderer/js/changelog.js for the in-app Welcome Modal
const changelogData = {
  version: nextVersion,
  releaseDate: new Date().toISOString().split('T')[0],
  points: changelogList
};
const changelogJsContent = `// Autogenerated changelog for v${nextVersion}\nconst APP_CHANGELOG = ${JSON.stringify(changelogData, null, 2)};\n`;
fs.writeFileSync(changelogFilePath, changelogJsContent, 'utf8');
console.log(`Generated and updated ${changelogFilePath}`);


// 4. Git operations
runCmd('git add .');
runCmd(`git commit -m "release: prepare release v${nextVersion}"`);
runCmd(`git tag -a v${nextVersion} -m "Release v${nextVersion}"`);

// 5. Push to GitHub
console.log('Pushing commit and tag to GitHub...');
runCmd('git push origin main');
runCmd(`git push origin v${nextVersion}`);

// 6. Create Draft Release on GitHub using GitHub CLI (with autogenerated notes)
console.log('Creating draft release on GitHub with autogenerated release notes...');
runCmd(`gh release create v${nextVersion} --draft --generate-notes`);

// 7. Build and Publish Release Assets
console.log('Building and publishing the release assets to GitHub...');
runCmd('npm run publish');

// 8. Make the Release Public/Stable
console.log('Publishing the draft release to make the update live...');
runCmd(`gh release edit v${nextVersion} --draft=false`);

// 9. Generate Facebook Post Template
console.log('Generating Facebook Post description...');
const facebookPostPath = path.join(__dirname, `../dist/facebook-post-v${nextVersion}.txt`);

const facebookPostContent = `📢 E-Class Record Update: Version v${nextVersion} is now LIVE! 🚀

We are excited to announce the release of E-Class Record v${nextVersion}! This update brings key features, optimizations, and improvements to your local teacher class record app.

🌟 What's New in this Version:
${fbChangelogPointsStr}

💻 How to Get the Update:
• For New Users: Download the latest setup installer directly from GitHub:
  👉 https://github.com/jerniqz-del/eclassrecord/releases/download/v${nextVersion}/E-Class-Record-Setup-${nextVersion}.exe

• For Existing Users: No need to reinstall! Simply open your app, go to Settings, and click "Check for Updates" to install the update instantly!

Thank you for using E-Class Record! Help your fellow teachers by sharing this post! 🧑‍🏫👩‍🏫

#EClassRecord #DepEd #GradingSheet #TeacherLife #EdTech #Update #TeacherTools
`;

fs.writeFileSync(facebookPostPath, facebookPostContent, 'utf8');

console.log(`\n======================================================`);
console.log(`🎉 FACEBOOK POST GENERATED: ${facebookPostPath}`);
console.log(`======================================================\n`);
console.log(facebookPostContent);
console.log(`======================================================\n`);
console.log(`Successfully bumped version, pushed to GitHub, and published Release v${nextVersion}!`);
