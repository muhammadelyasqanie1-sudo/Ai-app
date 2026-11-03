import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const required = ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];
for (const name of required) {
  if (!process.env[name]) throw new Error('Missing required release signing environment variable: ' + name);
}
const keystorePath = resolve(process.env.ANDROID_KEYSTORE_PATH);
if (!existsSync(keystorePath)) throw new Error('Android release keystore file does not exist.');

const gradlePath = resolve('android/app/build.gradle');
if (!existsSync(gradlePath)) throw new Error('Generated Android app Gradle file was not found: ' + gradlePath);
let source = readFileSync(gradlePath, 'utf8');

function matchingBrace(text, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return index;
  }
  throw new Error('Unbalanced Gradle block while configuring release signing.');
}

function locateBlock(text, name, from = 0) {
  const expression = new RegExp('\\b' + name + '\\s*\\{', 'g');
  expression.lastIndex = from;
  const match = expression.exec(text);
  if (!match) return null;
  const open = text.indexOf('{', match.index);
  return { open, close: matchingBrace(text, open) };
}

let android = locateBlock(source, 'android');
if (!android) throw new Error('Android Gradle configuration block is missing.');
if (!source.includes('AFG_AI_RELEASE_SIGNING')) {
  const signing = `
    // AFG_AI_RELEASE_SIGNING
    signingConfigs {
        release {
            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
    }
`;
  source = source.slice(0, android.close) + signing + source.slice(android.close);
  android = locateBlock(source, 'android');
}
const buildTypes = locateBlock(source, 'buildTypes', android.open);
if (buildTypes) {
  const release = locateBlock(source, 'release', buildTypes.open);
  if (release) {
    const body = source.slice(release.open + 1, release.close);
    if (!body.includes('signingConfig signingConfigs.release')) {
      source = source.slice(0, release.open + 1) + '\n            signingConfig signingConfigs.release' + source.slice(release.open + 1);
    }
  } else {
    source = source.slice(0, buildTypes.close) + '\n        release { signingConfig signingConfigs.release }\n    ' + source.slice(buildTypes.close);
  }
} else {
  android = locateBlock(source, 'android');
  source = source.slice(0, android.close) + '\n    buildTypes { release { signingConfig signingConfigs.release } }\n' + source.slice(android.close);
}
writeFileSync(gradlePath, source);
console.log('Configured Android release signing from environment variables.');
