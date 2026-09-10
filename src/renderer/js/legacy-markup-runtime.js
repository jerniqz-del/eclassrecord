(function initializeLegacyMarkupRuntime(globalScope) {
  'use strict';

  const EVENT_TYPES = Object.freeze([
    'click', 'change', 'contextmenu', 'dragend', 'dragleave',
    'dragover', 'dragstart', 'drop', 'input', 'keydown', 'keyup'
  ]);
  const BLOCKED_MEMBERS = new Set(['__proto__', 'prototype', 'constructor', 'electronAPI']);
  const BLOCKED_ROOTS = new Set([
    'eval', 'Function', 'require', 'process', 'electronAPI',
    'XMLHttpRequest', 'WebSocket'
  ]);
  const styleClasses = new Map();
  let styleSequence = 0;

  function splitTopLevel(source, separator) {
    const parts = [];
    let start = 0;
    let quote = '';
    let escaped = false;
    let depth = 0;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = '';
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === '(' || character === '[' || character === '{') depth += 1;
      else if (character === ')' || character === ']' || character === '}') depth -= 1;
      else if (character === separator && depth === 0) {
        parts.push(source.slice(start, index));
        start = index + 1;
      }
    }
    parts.push(source.slice(start));
    return parts;
  }

  function decodeString(source) {
    const quote = source[0];
    let result = '';
    for (let index = 1; index < source.length - 1; index += 1) {
      let character = source[index];
      if (character !== '\\') {
        result += character;
        continue;
      }
      index += 1;
      character = source[index] || '';
      const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
      result += Object.hasOwn(escapes, character) ? escapes[character] : character;
    }
    if (source[source.length - 1] !== quote) throw new Error('Unterminated handler string.');
    return result;
  }

  function matchingIndex(source, start, open, close) {
    let quote = '';
    let escaped = false;
    let depth = 0;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = '';
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === open) depth += 1;
      else if (character === close) {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    throw new Error('Unbalanced handler expression.');
  }

  function evaluateExpression(rawSource, context) {
    const source = String(rawSource || '').trim();
    if (!source) return undefined;
    if (source[0] === '!' && source[1] !== '=') return !evaluateExpression(source.slice(1), context);
    if ((source[0] === "'" && source[source.length - 1] === "'")
      || (source[0] === '"' && source[source.length - 1] === '"')) {
      return decodeString(source);
    }
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(source)) return Number(source);
    if (source === 'true') return true;
    if (source === 'false') return false;
    if (source === 'null') return null;
    if (source === 'undefined') return undefined;

    let index = 0;
    const identifier = /^[A-Za-z_$][\w$]*/.exec(source);
    if (!identifier) throw new Error('Unsupported handler expression: ' + source);
    const rootName = identifier[0];
    if (BLOCKED_ROOTS.has(rootName)) throw new Error('Blocked handler root: ' + rootName);
    index = rootName.length;
    let value;
    if (rootName === 'this') value = context.element;
    else if (rootName === 'event') value = context.event;
    else if (rootName === 'window' || rootName === 'globalThis') value = globalScope;
    else if (rootName === 'document') value = document;
    else value = globalScope[rootName];
    let owner = null;

    while (index < source.length) {
      while (/\s/.test(source[index] || '')) index += 1;
      if (source[index] === '.' || (source[index] === '?' && source[index + 1] === '.')) {
        index += source[index] === '?' ? 2 : 1;
        const member = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
        if (!member) throw new Error('Invalid handler member expression.');
        const memberName = member[0];
        if (BLOCKED_MEMBERS.has(memberName)) throw new Error('Blocked handler member: ' + memberName);
        index += memberName.length;
        owner = value;
        value = value == null ? undefined : value[memberName];
        continue;
      }
      if (source[index] === '[') {
        const close = matchingIndex(source, index, '[', ']');
        const key = evaluateExpression(source.slice(index + 1, close), context);
        if (BLOCKED_MEMBERS.has(String(key))) throw new Error('Blocked handler member.');
        owner = value;
        value = value == null ? undefined : value[key];
        index = close + 1;
        continue;
      }
      if (source[index] === '(') {
        const close = matchingIndex(source, index, '(', ')');
        if (typeof value !== 'function') throw new Error('Handler target is not callable: ' + source);
        const argumentsSource = source.slice(index + 1, close);
        const args = argumentsSource.trim()
          ? splitTopLevel(argumentsSource, ',').map(item => evaluateExpression(item, context))
          : [];
        value = value.apply(owner, args);
        owner = null;
        index = close + 1;
        continue;
      }
      throw new Error('Unsupported handler syntax: ' + source.slice(index));
    }
    return value;
  }

  function runHandler(source, element, event) {
    const context = { element, event };
    let result;
    const statements = splitTopLevel(String(source || ''), ';');
    for (const rawStatement of statements) {
      let statement = rawStatement.trim();
      if (!statement) continue;
      const guarded = /^if\s*\(\s*typeof\s+([A-Za-z_$][\w$]*)\s*===?\s*['"]function['"]\s*\)\s*(.+)$/.exec(statement);
      if (guarded) {
        if (typeof globalScope[guarded[1]] === 'function') result = evaluateExpression(guarded[2], context);
        continue;
      }
      let returns = false;
      if (statement.startsWith('return ')) {
        returns = true;
        statement = statement.slice(7).trim();
      }
      result = evaluateExpression(statement, context);
      if (returns) return result;
    }
    return result;
  }

  function styleSheet() {
    return Array.from(document.styleSheets).find(sheet =>
      String(sheet.href || '').endsWith('/css/runtime-generated.css')
    ) || null;
  }

  function safeStyleDeclarations(rawStyle) {
    const style = String(rawStyle || '').trim();
    if (!style) return '';
    if (/[{}@]/.test(style)
      || /(?:javascript|expression|behavior|-moz-binding)\s*[:(]/i.test(style)
      || /url\s*\(\s*['"]?\s*(?:https?|file|ftp|javascript):/i.test(style)) {
      throw new Error('Rejected unsafe generated style.');
    }
    return style;
  }

  function hydrateStyle(element) {
    if (!(element instanceof Element) || !element.hasAttribute('data-eclass-style')) return;
    const declarations = safeStyleDeclarations(element.getAttribute('data-eclass-style'));
    element.removeAttribute('data-eclass-style');
    if (!declarations) return;
    let className = styleClasses.get(declarations);
    if (!className) {
      className = 'eclass-generated-style-' + (++styleSequence);
      const sheet = styleSheet();
      if (!sheet) throw new Error('The generated-style sheet is unavailable.');
      sheet.insertRule('.' + className + '{' + declarations + '}', sheet.cssRules.length);
      styleClasses.set(declarations, className);
    }
    element.classList.add(className);
  }

  function hydrateStyles(root) {
    if (root instanceof Element) hydrateStyle(root);
    if (root && typeof root.querySelectorAll === 'function') {
      root.querySelectorAll('[data-eclass-style]').forEach(hydrateStyle);
    }
  }

  function migrateInlineHandlers(root) {
    if (!root) return;
    const visit = (element) => {
      if (!(element instanceof Element)) return;
      EVENT_TYPES.forEach((type) => {
        const name = 'on' + type;
        if (!element.hasAttribute(name)) return;
        const source = element.getAttribute(name);
        element.removeAttribute(name);
        if (String(source || '').trim()) {
          element.setAttribute('data-eclass-on' + type, source);
        }
      });
    };
    visit(root);
    if (typeof root.querySelectorAll !== 'function') return;
    EVENT_TYPES.forEach((type) => {
      root.querySelectorAll('[on' + type + ']').forEach(visit);
    });
  }

  function hydrateSubtree(root) {
    migrateInlineHandlers(root);
    hydrateStyles(root);
  }

  EVENT_TYPES.forEach(type => {
    document.addEventListener(type, event => {
      const target = event.target instanceof Element
        ? event.target.closest('[data-eclass-on' + type + ']')
        : null;
      if (!target) return;
      const source = target.getAttribute('data-eclass-on' + type);
      try {
        const result = runHandler(source, target, event);
        if (result === false) event.preventDefault();
      } catch (error) {
        console.error('Blocked invalid delegated handler:', error);
      }
    });
  });

  const observer = new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === 'attributes') hydrateStyle(record.target);
      record.addedNodes.forEach(hydrateSubtree);
    });
  });

  function start() {
    hydrateSubtree(document);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-eclass-style']
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  globalScope.LegacyMarkupRuntime = Object.freeze({
    runHandler,
    hydrateStyles,
    migrateInlineHandlers,
    hydrateSubtree,
    eventTypes: EVENT_TYPES.slice()
  });
})(window);
