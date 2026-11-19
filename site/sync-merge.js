(function(root){
  'use strict';
  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const plain = value => isObject(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const json = value => { try { return JSON.stringify(value); } catch (_) { return String(value); } };
  const preview = value => {
    if (value === undefined) return '[undefined]';
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.length > 240 ? value.slice(0, 240) + '…' : value;
    const text = json(value);
    return text.length > 240 ? text.slice(0, 240) + '…' : text;
  };
  function sourceKey(source) {
    const raw = String(source && (source.url || source.originalUrl || source.rawUrl) || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw);
      const match = u.pathname.match(/\/ershoufang\/(\d{8,})(?:\.html)?\/?$/i);
      if (match) {
        const host = u.hostname.toLowerCase();
        const channel = host.includes('5i5j') ? '我爱我家' : host.includes('ke.com') ? '贝壳' : host;
        return channel + ':' + match[1];
      }
    } catch (_) {}
    return raw;
  }
  function itemKey(item, field, index) {
    if (item === null || item === undefined) return 'null:' + index;
    if (typeof item !== 'object') return 'value:' + json(item);
    const pick = (...keys) => {
      for (const key of keys) if (item[key] !== undefined && item[key] !== null && item[key] !== '') return String(item[key]);
      return '';
    };
    if (field === 'houses') {
      const sources = (item.sources || []).map(sourceKey).filter(Boolean).sort();
      return pick('id') || (sources.length ? 'source:' + sources.join('|') : 'house:' + pick('community','title') + ':' + pick('firstSeen'));
    }
    if (field === 'sources') return sourceKey(item) || pick('platformKey','platformId','id') || 'source:' + json(item);
    if (field === 'scopes') return pick('id','name') || 'scope:' + index;
    if (field === 'benchmarks') return pick('id','url','sourceUrl') || 'benchmark:' + pick('community','date') + ':' + pick('price');
    if (field === 'marketScans') return pick('id','snapshotId') || 'scan:' + pick('date') + ':' + pick('community') + ':' + pick('source');
    if (field === 'saleLeads') return pick('id','leadId','listingKey','url','canonicalUrl') || 'lead:' + json(item);
    if (field === 'quarantine') return pick('id','candidateId','listingKey') || 'quarantine:' + json(item);
    if (field === 'listingCandidates') return pick('candidateId','listingKey','id') || 'candidate:' + pick('platform','platformListingId');
    if (field === 'linkLedger') return pick('id','listingKey','canonicalUrl','url') || 'link:' + json(item);
    if (field === 'visitSessions') return pick('id','sessionId') || 'visit:' + pick('date','meetingTime') + ':' + pick('broker');
    if (field === 'events') return pick('id','eventId') || 'event:' + pick('date') + ':' + pick('kind') + ':' + pick('title') + ':' + pick('desc');
    if (field === 'entries') return pick('id','entryId','houseId','listingKey') || 'entry:' + json(item);
    return pick('id','key','uuid','candidateId','listingKey') || field + ':' + json(item);
  }
  function isTimestampField(field) {
    return /(?:At|Seen|checked|captureAt|updatedAt|createdAt|deletedAt)$/i.test(field || '');
  }
  function mergeScalar(local, remote, path, conflicts, field) {
    if (Object.is(local, remote) || json(local) === json(remote)) return local;
    if (local === undefined || local === null || local === '') return remote;
    if (remote === undefined || remote === null || remote === '') return local;
    if (isTimestampField(field)) {
      const a = Date.parse(local), b = Date.parse(remote);
      if (Number.isFinite(a) && Number.isFinite(b)) return a >= b ? local : remote;
    }
    if (conflicts.length < 120) conflicts.push({ path, local: preview(local), remote: preview(remote), chosen: 'local' });
    return local;
  }
  function mergeArray(local, remote, path, conflicts) {
    const field = path.split('.').pop() || 'items';
    const result = [];
    const positions = new Map();
    const add = (item, sourceIndex) => {
      const key = itemKey(item, field, sourceIndex);
      if (positions.has(key)) {
        const at = positions.get(key);
        result[at] = mergeValue(item, result[at], path + '[' + key + ']', conflicts, field);
      } else {
        positions.set(key, result.length);
        result.push(item);
      }
    };
    (remote || []).forEach((item, index) => add(item, index));
    (local || []).forEach((item, index) => add(item, index));
    return result;
  }
  function mergeValue(local, remote, path, conflicts, field) {
    if (Array.isArray(local) && Array.isArray(remote)) return mergeArray(local, remote, path, conflicts);
    if (plain(local) && plain(remote)) {
      const result = {};
      const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
      for (const key of keys) {
        const hasLocal = Object.prototype.hasOwnProperty.call(local, key);
        const hasRemote = Object.prototype.hasOwnProperty.call(remote, key);
        if (hasLocal && hasRemote) result[key] = mergeValue(local[key], remote[key], path + '.' + key, conflicts, key);
        else result[key] = hasLocal ? local[key] : remote[key];
      }
      return result;
    }
    return mergeScalar(local, remote, path, conflicts, field);
  }
  function mergeStates(localState, remoteState, meta) {
    const conflicts = [];
    const local = plain(localState) ? localState : {};
    const remote = plain(remoteState) ? remoteState : {};
    const merged = mergeValue(local, remote, 'state', conflicts, 'state');
    const previous = [];
    for (const item of [...(remote.syncConflicts || []), ...(local.syncConflicts || [])]) {
      const key = item && (item.id || item.at) || json(item);
      if (!previous.some(x => (x && (x.id || x.at) || json(x)) === key)) previous.push(item);
    }
    if (conflicts.length) {
      previous.unshift({
        id: 'SYNC-' + Date.now().toString(36),
        at: new Date().toISOString(),
        localVersion: Number(meta && meta.localVersion || 0),
        remoteVersion: Number(meta && meta.remoteVersion || 0),
        count: conflicts.length,
        details: conflicts
      });
    }
    merged.syncConflicts = previous.slice(0, 30);
    return { state: merged, conflictCount: conflicts.length };
  }
  root.HQSyncMerge = { mergeStates };
})(typeof window !== 'undefined' ? window : globalThis);
