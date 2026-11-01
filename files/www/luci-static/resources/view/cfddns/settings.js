'use strict';
'require view';
'require form';
'require fs';
'require uci';
'require ui';

function isPpp(proto) {
    return [ 'ppp', 'pppoe', 'pppoa', 'pptp', 'l2tp', '3g' ].indexOf(proto) >= 0;
}

function runCmd(title, args, reload) {
    ui.showModal(title, [ E('p', { 'class': 'spinning' }, _('Running...')) ]);
    return fs.exec('/usr/bin/cfddns', args).then(function(res) {
        var out = ((res.stdout || '') + (res.stderr || '')).trim() || _('(no output)');
        ui.showModal(title, [
            E('pre', { 'style': 'white-space:pre-wrap;word-break:break-all' }, out),
            E('div', { 'class': 'right' }, [
                E('button', {
                    'class': 'btn cbi-button',
                    'click': function() {
                        ui.hideModal();
                        if (reload) window.location.reload();
                    }
                }, _('Close'))
            ])
        ]);
    }).catch(function(err) {
        ui.hideModal();
        ui.addNotification(null, E('p', (err && err.message) || String(err)), 'danger');
    });
}

function closeBtn() {
    return E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Close'));
}

function parseRecords(out) {
    var records = [], error = null;
    out.split('\n').forEach(function(line) {
        var j;
        line = line.trim();
        if (!line) return;
        try { j = JSON.parse(line); } catch (e) { return; }
        if (j.error) { error = j.error; return; }
        ((j.records && j.records.result) || []).forEach(function(r) {
            records.push({ name: r.name, content: r.content, zone: j.zone, zone_id: j.zone_id });
        });
    });
    return { records: records, error: error };
}

function importDomains(nets) {
    var title = _('Import from Cloudflare');
    ui.showModal(title, [ E('p', { 'class': 'spinning' }, _('Loading...')) ]);
    return fs.exec('/usr/bin/cfddns', [ 'records' ]).then(function(res) {
        var p = parseRecords(res.stdout || '');
        if (p.error || !p.records.length || !nets.length) {
            ui.showModal(title, [
                E('p', {}, p.error || (nets.length ? _('No A records found.') : _('No network interfaces found.'))),
                E('div', { 'class': 'right' }, [ closeBtn() ])
            ]);
            return;
        }

        var existing = {};
        uci.sections('cfddns', 'domain').forEach(function(s) { existing[s.name] = true; });

        var sel = E('select', { 'class': 'cbi-input-select' },
            nets.map(function(n) { return E('option', { 'value': n }, n); }));

        var all = E('input', { 'type': 'checkbox' });
        all.addEventListener('change', function() {
            p.records.forEach(function(r) { if (!r.cb.disabled) r.cb.checked = all.checked; });
        });

        var rows = p.records.map(function(r) {
            r.cb = E('input', { 'type': 'checkbox' });
            if (existing[r.name]) r.cb.disabled = true;
            return E('tr', { 'class': 'tr' }, [
                E('td', { 'class': 'td' }, r.cb),
                E('td', { 'class': 'td' }, r.name + (existing[r.name] ? ' ' + _('(already added)') : '')),
                E('td', { 'class': 'td' }, r.content || ''),
                E('td', { 'class': 'td' }, r.zone)
            ]);
        });

        var head = E('tr', { 'class': 'tr table-titles' }, [
            E('th', { 'class': 'th' }, all),
            E('th', { 'class': 'th' }, _('Domain')),
            E('th', { 'class': 'th' }, _('Current IP')),
            E('th', { 'class': 'th' }, _('Zone'))
        ]);

        ui.showModal(title, [
            E('p', {}, _('Select A records to add. Selected domains are bound to the interface below.')),
            E('p', {}, [ E('strong', {}, _('Interface') + ': '), sel ]),
            E('div', { 'style': 'max-height:50vh;overflow:auto' },
                E('table', { 'class': 'table' }, [ head ].concat(rows))),
            E('div', { 'class': 'right' }, [
                closeBtn(), ' ',
                E('button', {
                    'class': 'btn cbi-button cbi-button-positive',
                    'click': function() {
                        var added = 0;
                        p.records.forEach(function(r) {
                            if (!r.cb.checked || r.cb.disabled) return;
                            var id = uci.add('cfddns', 'domain');
                            uci.set('cfddns', id, 'enabled', '1');
                            uci.set('cfddns', id, 'name', r.name);
                            uci.set('cfddns', id, 'interface', sel.value);
                            uci.set('cfddns', id, 'zone_id', r.zone_id);
                            added++;
                        });
                        if (!added) { ui.hideModal(); return; }
                        return uci.save().then(function() { window.location.reload(); });
                    }
                }, _('Add selected'))
            ])
        ]);
    }).catch(function(err) {
        ui.hideModal();
        ui.addNotification(null, E('p', (err && err.message) || String(err)), 'danger');
    });
}

return view.extend({
    load: function() {
        return uci.load('network');
    },

    render: function() {
        var m, s, o;
        var nets = uci.sections('network', 'interface')
            .map(function(n) { return n['.name']; })
            .filter(function(n) { return n !== 'loopback'; });

        m = new form.Map('cfddns', _('Cloudflare DDNS'),
            _('Updates Cloudflare A records per WAN interface: on interface up and periodically.'));

        /* General */
        s = m.section(form.NamedSection, 'global', 'global', _('General'));

        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;

        o = s.option(form.Value, 'api_token', _('Cloudflare API token'),
            _('One token for all domains. Permissions: Zone - Zone - Read, Zone - DNS - Edit.'));
        o.password = true;

        o = s.option(form.ListValue, 'cron_interval', _('Periodic check'),
            _('In addition to interface up events (catches IP changes without link flap).'));
        o.value('0', _('Disabled'));
        [1, 5, 10, 15, 30, 60].forEach(function(v) {
            o.value(String(v), _('Every %d min').format(v));
        });
        o.default = '5';

        o = s.option(form.Value, 'retries', _('Attempts at interface up'),
            _('Used by interface-up events (boot, reconnect): DNS or time may not be ready yet.'));
        o.datatype = 'range(1,10)';
        o.default = '3';

        o = s.option(form.Value, 'retry_delay', _('Delay between attempts (s)'));
        o.datatype = 'range(1,300)';
        o.default = '20';

        o = s.option(form.DynamicList, 'ip_service', _('IP check services'),
            _('Used by the "web" IP source, tried in order through the WAN interface. ' +
              'The first IPv4 found in the response is used (plain text or JSON). ' +
              'Empty = ifconfig.me/ip, api.ipify.org, icanhazip.com, checkip.amazonaws.com.'));
        o.placeholder = 'https://api.ipify.org';
        o.validate = function(section_id, value) {
            if (value == null || value === '') return true;
            return /^https?:\/\/[^\s'"]+$/.test(value) || _('Invalid URL');
        };

        o = s.option(form.Button, '_zones', _('Zone IDs'),
            _('Save & Apply first. Fetches and caches Zone ID for every domain below.'));
        o.inputtitle = _('Get Zone IDs');
        o.inputstyle = 'action';
        o.onclick = function() { return runCmd(_('Zone IDs'), ['zones'], true); };

        o = s.option(form.Button, '_import', _('Domains'),
            _('Save & Apply the token first. Lists A records from all zones available to the token.'));
        o.inputtitle = _('Import from Cloudflare');
        o.inputstyle = 'action';
        o.onclick = function() { return importDomains(nets); };

        o = s.option(form.Button, '_run', _('Update now'),
            _('Save & Apply first. Runs the update for all enabled interfaces.'));
        o.inputtitle = _('Run');
        o.inputstyle = 'apply';
        o.onclick = function() { return runCmd(_('Update'), ['run'], false); };

        /* Interfaces */
        s = m.section(form.GridSection, 'interface', _('Interfaces'),
            _('web: ifconfig.me, ipify, icanhazip, amazonaws are queried through this interface; the answer is validated. ' +
              'iface: IPv4 is taken from the interface; skipped if it is private (NAT).'));
        s.anonymous = true;
        s.addremove = true;
        s.sortable = true;
        s.nodescriptions = true;

        o = s.option(form.Flag, 'enabled', _('Enabled'));
        o.default = '1';
        o.rmempty = false;
        o.editable = true;

        o = s.option(form.ListValue, 'network', _('Interface'));
        nets.forEach(function(n) { o.value(n); });
        o.rmempty = false;

        o = s.option(form.ListValue, 'ip_source', _('IP source'));
        o.value('web', _('External web service'));
        o.value('iface', _('Interface address'));
        o.default = 'web';

        o = s.option(form.DummyValue, '_proto', _('Protocol / update trigger'));
        o.modalonly = false;
        o.cfgvalue = function(section_id) {
            var net = uci.get('cfddns', section_id, 'network');
            var proto = net ? uci.get('network', net, 'proto') : null;
            if (!proto) return '-';
            return proto + ': ' + (isPpp(proto) ? _('on connect') : _('on up and address change'));
        };

        /* Domains */
        s = m.section(form.GridSection, 'domain', _('Domains'),
            _('A domain is processed if its interface is also enabled in the table above. Clear Zone ID to re-fetch it.'));
        s.anonymous = true;
        s.addremove = true;
        s.sortable = true;
        s.nodescriptions = true;

        o = s.option(form.Flag, 'enabled', _('Enabled'));
        o.default = '1';
        o.rmempty = false;
        o.editable = true;

        o = s.option(form.Value, 'name', _('Domain'));
        o.datatype = 'hostname';
        o.rmempty = false;

        o = s.option(form.ListValue, 'interface', _('Interface'));
        nets.forEach(function(n) { o.value(n); });
        o.rmempty = false;

        o = s.option(form.Value, 'zone_id', _('Zone ID'));
        o.placeholder = _('auto');

        /* Telegram */
        s = m.section(form.NamedSection, 'telegram', 'telegram', _('Telegram notifications'));

        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;

        o = s.option(form.Value, 'bot_token', _('Bot token'));
        o.password = true;
        o.depends('enabled', '1');

        o = s.option(form.Value, 'chat_id', _('Chat ID'));
        o.depends('enabled', '1');

        o = s.option(form.ListValue, 'proxy_type', _('Proxy'));
        o.value('none', _('None'));
        o.value('http', _('HTTP'));
        o.value('https', _('HTTPS'));
        o.value('socks5h', _('SOCKS5'));
        o.default = 'none';
        o.depends('enabled', '1');

        function pdep(opt) {
            [ 'http', 'https', 'socks5h' ].forEach(function(t) {
                opt.depends({ 'enabled': '1', 'proxy_type': t });
            });
        }

        o = s.option(form.Value, 'proxy_host', _('Proxy host'));
        o.datatype = 'host';
        pdep(o);

        o = s.option(form.Value, 'proxy_port', _('Proxy port'),
            _('Empty = default (HTTP 3128, HTTPS 443, SOCKS5 1080).'));
        o.datatype = 'port';
        o.placeholder = _('default');
        pdep(o);

        o = s.option(form.Value, 'proxy_user', _('Proxy user (optional)'));
        pdep(o);

        o = s.option(form.Value, 'proxy_pass', _('Proxy password'));
        o.password = true;
        pdep(o);

        o = s.option(form.Flag, 'proxy_insecure', _('Skip proxy certificate check'),
            _('HTTPS proxy only (self-signed certificate).'));
        o.depends({ 'enabled': '1', 'proxy_type': 'https' });

        o = s.option(form.Flag, 'notify_update', _('Notify on update'));
        o.default = '1';
        o.rmempty = false;
        o.depends('enabled', '1');

        o = s.option(form.Flag, 'notify_error', _('Notify on errors'));
        o.rmempty = false;
        o.depends('enabled', '1');

        o = s.option(form.Button, '_tgtest', _('Test'), _('Save & Apply first.'));
        o.inputtitle = _('Send test message');
        o.inputstyle = 'action';
        o.onclick = function() { return runCmd(_('Telegram test'), ['tgtest'], false); };
        o.depends('enabled', '1');

        return m.render();
    }
});
