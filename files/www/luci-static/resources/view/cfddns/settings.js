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

        o = s.option(form.Button, '_zones', _('Zone IDs'),
            _('Save & Apply first. Fetches and caches Zone ID for every domain below.'));
        o.inputtitle = _('Get Zone IDs');
        o.inputstyle = 'action';
        o.onclick = function() { return runCmd(_('Zone IDs'), ['zones'], true); };

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
