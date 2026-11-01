# luci-app-cfddns

Cloudflare DDNS для OpenWrt (multi-WAN) + LuCI: Services -> Cloudflare DDNS.
Пакет архитектурно-независимый (shell + JS). OpenWrt 25.12+ -> `.apk`, 24.10 и старее -> `.ipk` (тот же исходник).

## Возможности
- Интерфейсы: вкл/выкл, источник IP: `web` (ifconfig.me, ipify, icanhazip, amazonaws через этот интерфейс, проверка формата и не-private) или `iface` (адрес с интерфейса, private/NAT пропускается).
- Домены привязаны к интерфейсу, вкл/выкл по каждому. Если A-записи нет, создаётся (TTL auto, proxied=off). Существующая обновляется через PATCH (proxied/TTL сохраняются).
- Импорт доменов из Cloudflare: кнопка "Import from Cloudflare" показывает A-записи всех зон токена, выбранные добавляются вместе с Zone ID (затем Save & Apply).
- Один API token на все домены. Zone ID получается через API, кешируется в UCI (кнопка "Get Zone IDs" или автоматически при первом обновлении).
- Запуск определяется по протоколу интерфейса (`network.<if>.proto`, показан в таблице Interfaces):
  - ppp/pppoe/pppoa/pptp/l2tp/3g: при поднятии соединения (`ifup`);
  - dhcp/static/прочие: при `ifup` и при смене адреса (`ifupdate`);
  - плюс cron (интервал в UI, 0 = выкл);
  - при загрузке роутера интерфейсы поднимаются, срабатывает `ifup`; при событиях интерфейса делается несколько попыток (по умолчанию 3 с паузой 20 с), так как время/DNS могут быть ещё не готовы; уведомление об ошибке в Telegram уходит только после последней попытки.
- Сервисы проверки IP настраиваются списком (порядок = приоритет); из ответа берётся первый IPv4 (plain text или JSON). Пусто = встроенный список.
- Telegram: уведомления об обновлении / об ошибках, прокси (HTTP / HTTPS / SOCKS5, порт, логин/пароль, пропуск проверки сертификата прокси), тест-кнопка.
  Для HTTPS-прокси нужен curl с поддержкой HTTPS-proxy (проверка: `curl -V | grep HTTPS-proxy`).

## Сборка с нуля (Linux x86_64: Debian/Ubuntu)

1. Зависимости:
```
sudo apt update
sudo apt install -y build-essential clang flex bison g++ gawk gcc-multilib g++-multilib gettext git libncurses-dev libssl-dev python3-setuptools rsync swig unzip zlib1g-dev file wget zstd
```
2. Узнать версию/платформу роутера:
```
ssh root@192.168.1.1 'ubus call system board'
```
Нужны `release.version` (например 25.12.0) и `release.target` (например `x86/64`).

3. Скачать и распаковать SDK (подставить версию и target):
```
wget https://downloads.openwrt.org/releases/25.12.0/targets/x86/64/
```
Открыть страницу в браузере, скопировать ссылку на `openwrt-sdk-...tar.zst`, затем:
```
wget <ссылка_на_sdk>
tar -xf openwrt-sdk-*.tar.zst
cd openwrt-sdk-*/
```
4. Положить пакет и подтянуть фиды:
```
unzip ~/luci-app-cfddns.zip -d package/
./scripts/feeds update -a
./scripts/feeds install -a
```
5. Включить пакет и собрать:
```
make defconfig
echo "CONFIG_PACKAGE_luci-app-cfddns=m" >> .config
make defconfig
make package/luci-app-cfddns/compile V=s
```
6. Найти результат:
```
find bin -name 'luci-app-cfddns*'
```
7. Установить на роутер:
```
scp <файл>.apk root@192.168.1.1:/tmp/
ssh root@192.168.1.1 'apk add --allow-untrusted /tmp/luci-app-cfddns-*.apk'
```
(для .ipk: `opkg install /tmp/luci-app-cfddns_*.ipk`).
Зависимости (`curl`, `ca-bundle`, `jsonfilter`, `luci-base`) подтянутся сами.

## Быстрая проверка без сборки
```
scp -r luci-app-cfddns/files/* root@192.168.1.1:/
ssh root@192.168.1.1 'chmod +x /usr/bin/cfddns /etc/init.d/cfddns /etc/hotplug.d/iface/90-cfddns; apk add curl ca-bundle jsonfilter; /etc/init.d/cfddns enable; /etc/init.d/cfddns start; /etc/init.d/rpcd reload'
```
Обновить страницу LuCI (Ctrl+F5).

## Настройка
1. Cloudflare: My Profile -> API Tokens -> Create Token -> Custom: Zone/Zone/Read + Zone/DNS/Edit, Zone Resources: нужные зоны (или All zones).
2. LuCI -> Services -> Cloudflare DDNS: Enable, вставить token, Save & Apply.
3. Interfaces: добавить WAN-интерфейс(ы), выбрать источник IP.
4. Domains: добавить FQDN и интерфейс. Save & Apply.
5. "Get Zone IDs" -> "Update now".
6. (Опционально) Telegram: bot token, chat id, proxy -> Save & Apply -> "Send test message".

## CLI
```
cfddns run [network]   # обновить все / один интерфейс
cfddns run wan retry # с повторами, как при ifup
cfddns zones           # получить и закешировать Zone ID
cfddns records         # JSON: A-записи всех зон (для импорта)
cfddns tgtest          # тест Telegram
logread -e cfddns
```

## Заметки
- Домен с другой зоной: Zone ID ищется по цепочке меток (a.b.example.com -> b.example.com -> example.com).
- Сменили домен у записи: очистите Zone ID, чтобы он получился заново.
- Лог/сообщения скрипта на английском. UI на английском (переводы `_()` можно добавить через po).
