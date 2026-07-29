(function (globalScope) {
  'use strict';

  const MISSING = Symbol('missing');

  function clone(value) {
    return value === MISSING ? MISSING : JSON.parse(JSON.stringify(value));
  }

  function stable(value) {
    if (value === MISSING) return '__MISSING__';
    return globalScope.stableStringify(value);
  }

  function equal(left, right) {
    return stable(left) === stable(right);
  }

  function isPlainObject(value) {
    return value !== MISSING && value && typeof value === 'object' && !Array.isArray(value);
  }

  function pointerSegment(value) {
    return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
  }

  function pointer(path) {
    return '/' + path.map(pointerSegment).join('/');
  }

  function keyedArray(values) {
    const present = values.filter(value => value !== MISSING);
    if (!present.length || !present.every(Array.isArray)) return false;
    const items = present.flat();
    return items.length > 0 && items.every(item => isPlainObject(item) && typeof item.id === 'string' && item.id);
  }

  function mapById(value) {
    return new Map((value === MISSING ? [] : value).map(item => [item.id, item]));
  }

  function orderedIds(base, local, remote) {
    const seen = new Set();
    const ids = [];
    for (const collection of [base, local, remote]) {
      if (collection === MISSING) continue;
      for (const item of collection) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          ids.push(item.id);
        }
      }
    }
    return ids;
  }

  function mergeThreeWay(baseValue, localValue, remoteValue, resolutions = {}) {
    const conflicts = [];
    let automaticChanges = 0;

    function conflict(base, local, remote, path, kind = 'different-values') {
      const key = pointer(path);
      const choice = resolutions[key];
      conflicts.push({
        path: key,
        kind,
        base: base === MISSING ? undefined : clone(base),
        local: local === MISSING ? undefined : clone(local),
        remote: remote === MISSING ? undefined : clone(remote)
      });
      return clone(choice === 'remote' ? remote : local);
    }

    function merge(base, local, remote, path) {
      if (equal(local, remote)) return clone(local);
      if (equal(local, base)) {
        automaticChanges += 1;
        return clone(remote);
      }
      if (equal(remote, base)) return clone(local);

      if (base === MISSING && local !== MISSING && remote !== MISSING) {
        return conflict(base, local, remote, path, 'same-id-added-differently');
      }
      if (local === MISSING || remote === MISSING) {
        return conflict(base, local, remote, path, 'edit-versus-delete');
      }

      if (keyedArray([base, local, remote])) {
        const baseMap = mapById(base);
        const localMap = mapById(local);
        const remoteMap = mapById(remote);
        const output = [];
        for (const id of orderedIds(base, local, remote)) {
          const merged = merge(
            baseMap.has(id) ? baseMap.get(id) : MISSING,
            localMap.has(id) ? localMap.get(id) : MISSING,
            remoteMap.has(id) ? remoteMap.get(id) : MISSING,
            path.concat(`@id=${id}`)
          );
          if (merged !== MISSING) output.push(merged);
        }
        return output;
      }

      if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
        const output = {};
        const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
        for (const key of keys) {
          const merged = merge(
            Object.prototype.hasOwnProperty.call(base, key) ? base[key] : MISSING,
            Object.prototype.hasOwnProperty.call(local, key) ? local[key] : MISSING,
            Object.prototype.hasOwnProperty.call(remote, key) ? remote[key] : MISSING,
            path.concat(key)
          );
          if (merged !== MISSING) output[key] = merged;
        }
        return output;
      }

      return conflict(base, local, remote, path);
    }

    const merged = merge(
      baseValue === undefined ? MISSING : baseValue,
      localValue === undefined ? MISSING : localValue,
      remoteValue === undefined ? MISSING : remoteValue,
      []
    );
    return { merged: merged === MISSING ? undefined : merged, conflicts, automaticChanges };
  }

  /**
   * Combines two snapshots that do not yet share revision ancestry.
   *
   * Missing values are preserved from whichever PC has them, because absence
   * cannot safely be interpreted as an intentional deletion without a base.
   * Different values at the same path remain explicit user conflicts.
   */
  function mergeTwoWayConservative(localValue, remoteValue, resolutions = {}) {
    const conflicts = [];
    let automaticChanges = 0;

    function conflict(local, remote, path, kind = 'different-values') {
      const key = pointer(path);
      const choice = resolutions[key];
      conflicts.push({
        path: key,
        kind,
        base: undefined,
        local: local === MISSING ? undefined : clone(local),
        remote: remote === MISSING ? undefined : clone(remote)
      });
      return clone(choice === 'remote' ? remote : local);
    }

    function merge(local, remote, path) {
      if (equal(local, remote)) return clone(local);
      if (local === MISSING) {
        automaticChanges += 1;
        return clone(remote);
      }
      if (remote === MISSING) return clone(local);

      if (keyedArray([local, remote])) {
        const localMap = mapById(local);
        const remoteMap = mapById(remote);
        const output = [];
        for (const id of orderedIds(MISSING, local, remote)) {
          const merged = merge(
            localMap.has(id) ? localMap.get(id) : MISSING,
            remoteMap.has(id) ? remoteMap.get(id) : MISSING,
            path.concat(`@id=${id}`)
          );
          if (merged !== MISSING) output.push(merged);
        }
        return output;
      }

      if (isPlainObject(local) && isPlainObject(remote)) {
        const output = {};
        const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
        for (const key of keys) {
          const merged = merge(
            Object.prototype.hasOwnProperty.call(local, key) ? local[key] : MISSING,
            Object.prototype.hasOwnProperty.call(remote, key) ? remote[key] : MISSING,
            path.concat(key)
          );
          if (merged !== MISSING) output[key] = merged;
        }
        return output;
      }

      return conflict(local, remote, path, 'no-common-base');
    }

    const merged = merge(
      localValue === undefined ? MISSING : localValue,
      remoteValue === undefined ? MISSING : remoteValue,
      []
    );
    return { merged: merged === MISSING ? undefined : merged, conflicts, automaticChanges };
  }

  const api = { mergeThreeWay, mergeTwoWayConservative };
  globalScope.SharedSyncMerge = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
