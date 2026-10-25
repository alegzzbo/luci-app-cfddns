include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-cfddns
PKG_VERSION:=1.1.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-cfddns
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Cloudflare DDNS for multi-WAN (LuCI)
  DEPENDS:=+luci-base +curl +ca-bundle +jsonfilter
  PKGARCH:=all
endef

define Package/luci-app-cfddns/description
  Cloudflare DDNS updater: per-interface IP source, Telegram notifications, LuCI UI.
endef

define Package/luci-app-cfddns/conffiles
/etc/config/cfddns
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-cfddns/install
	$(INSTALL_DIR) $(1)
	$(CP) ./files/* $(1)/
	chmod 0755 $(1)/usr/bin/cfddns $(1)/etc/init.d/cfddns $(1)/etc/hotplug.d/iface/90-cfddns
endef

define Package/luci-app-cfddns/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/cfddns enable
	/etc/init.d/cfddns start
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
	/etc/init.d/rpcd reload
}
exit 0
endef

define Package/luci-app-cfddns/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/cfddns stop
	/etc/init.d/cfddns disable
}
exit 0
endef

$(eval $(call BuildPackage,luci-app-cfddns))
