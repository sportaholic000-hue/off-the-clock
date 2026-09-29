import fs from 'node:fs';
import readline from 'node:readline';

function literalValue(source) {
  const directApply = source.match(/tools\.apply_patch\(("(?:\\.|[^"\\])*")\)/s);
  if (directApply) {
    try {
      return JSON.parse(directApply[1]);
    } catch {
      return null;
    }
  }
  const assignment = source.indexOf('=');
  if (assignment >= 0) {
    const value = source.slice(assignment + 1).trimStart();
    let end = -1;
    if (value.startsWith('String.raw`')) {
      for (let index = 10; index < value.length; index += 1) {
        if (value[index] === '`' && value[index - 1] !== '\\') {
          end = index + 1;
          break;
        }
      }
    } else if (value.startsWith('`')) {
      for (let index = 1; index < value.length; index += 1) {
        if (value[index] === '`' && value[index - 1] !== '\\') {
          end = index + 1;
          break;
        }
      }
    } else if (value.startsWith('"')) {
      for (let index = 1; index < value.length; index += 1) {
        if (value[index] === '"' && value[index - 1] !== '\\') {
          end = index + 1;
          break;
        }
      }
    }
    if (end > 0) {
      const expression = value.slice(0, end);
      try {
        return value.startsWith('"')
          ? JSON.parse(expression)
          : Function(`"use strict"; return (${expression});`)();
      } catch {
        // Fall through to nested exec-command extraction.
      }
    }
  }
  const nested = source.match(/tools\.exec_command\((\{[\s\S]*\})\);\s*text/);
  if (nested) {
    try {
      return JSON.parse(nested[1]).cmd;
    } catch {
      return null;
    }
  }
  return null;
}

function patchValue(source) {
  const value = literalValue(source);
  if (typeof value !== 'string') return null;
  const start = value.indexOf('*** Begin Patch');
  const end = value.indexOf('*** End Patch', start);
  return start >= 0 && end >= 0
    ? value.slice(start, end + '*** End Patch'.length)
    : null;
}

const [logPath, ...ordinalValues] = process.argv.slice(2);
const wanted = new Set(ordinalValues.map(Number));
const found = new Map();
const lines = readline.createInterface({
  input: fs.createReadStream(logPath, { encoding: 'utf8' }),
  crlfDelay: Infinity
});

for await (const line of lines) {
  if (!line) continue;
  const row = JSON.parse(line);
  if (!wanted.has(row.ordinal)) continue;
  const source = row.payload?.input;
  const patch = typeof source === 'string' ? patchValue(source) : null;
  if (!patch) throw new Error(`Could not extract patch at ordinal ${row.ordinal}.`);
  found.set(row.ordinal, patch);
}

for (const ordinal of wanted) {
  if (!found.has(ordinal)) throw new Error(`Patch ordinal ${ordinal} was not found.`);
}

process.stdout.write(JSON.stringify([...found].sort((left, right) => left[0] - right[0])));
