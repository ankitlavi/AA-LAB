import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { returnInfo } from './src/logic/orders';
import { IS_MIRROR, onMirror, postMirror } from './src/mirror';
import { ScrapeHost } from './src/scrape/ScrapeHost';
import { AccountsScreen } from './src/screens/AccountsScreen';
import { CompareScreen } from './src/screens/CompareScreen';
import { OffersModal } from './src/screens/OffersModal';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { SiteBrowser } from './src/screens/SiteBrowser';
import { useServices } from './src/services';
import { siteById } from './src/sites';
import { StoreProvider, useStore } from './src/store';
import { Listing } from './src/types';
import { C, ToastHost, useToast } from './src/ui';

type Tab = 'orders' | 'compare' | 'accounts';
type Browser = { siteId: string; url: string; mode: 'login' | 'shop' };

function Root() {
  const insets = useSafeAreaInsets();
  const { visibleOrders, orders, setConnected, rememberPage, ready, demo, syncEveryMin, lastSyncAt } = useStore();
  const { syncSite, syncAll, resolveStatuses, checkWatchlist } = useServices();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('orders');
  const [compareQuery, setCompareQuery] = useState('');
  const [offersFor, setOffersFor] = useState<Listing | null>(null);
  const [browser, setBrowser] = useState<Browser | null>(null);

  // Each time the app opens, quietly re-check watched products whose price is more than a few hours old.
  const rechecked = useRef(false);
  useEffect(() => {
    // The phone preview is display-only — it must not scrape or raise alerts.
    if (!ready || demo || rechecked.current || Platform.OS === 'web' || IS_MIRROR) return;
    rechecked.current = true;
    checkWatchlist(true).then((r) => {
      if (r.drops) toast(`🔔 ${r.drops} price drop${r.drops === 1 ? '' : 's'} on your watchlist`);
    });
  }, [ready, demo, checkWatchlist, toast]);

  // Background auto-sync: re-read connected shops on the interval the user chose
  // (My shops → Auto-sync, default 30 min) so order status, return deadlines and
  // prices stay current without tapping Sync. Runs in the real app only — never
  // in the display-only phone preview or in sample mode. A one-minute tick reads
  // the latest interval/last-sync from a ref, so changing the setting takes
  // effect without re-arming, and a sync that's overdue at launch runs ~4s in.
  const syncing = useRef(false);
  const syncCfg = useRef({ every: syncEveryMin, last: lastSyncAt });
  syncCfg.current = { every: syncEveryMin, last: lastSyncAt };
  useEffect(() => {
    if (!ready || demo || IS_MIRROR) return;
    const run = async () => {
      const { every, last } = syncCfg.current;
      if (every <= 0 || syncing.current) return;
      if (last && Date.now() - last < every * 60000) return;
      syncing.current = true;
      try {
        await syncAll();
      } catch {
        // A failed cycle just waits for the next tick.
      } finally {
        syncing.current = false;
      }
    };
    const kickoff = setTimeout(run, 4000);
    const tick = setInterval(run, 60000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(tick);
    };
  }, [ready, demo, syncAll]);

  // After any sync, resolve orders whose list card had no readable status by
  // reading their live tracking. Debounced so a burst of sync updates settles
  // first; resolveStatuses is self-limiting (a few per pass, skips ones checked
  // in the last 6h), so each resolved batch re-triggers this and drains the rest
  // until none are left to look up — then it stops on its own.
  const resolving = useRef(false);
  useEffect(() => {
    if (!ready || demo || IS_MIRROR) return;
    if (!orders.some((o) => o.status === 'unknown' && !o.manual)) return;
    const t = setTimeout(async () => {
      if (resolving.current) return; // a pass is already draining the backlog
      resolving.current = true;
      try {
        await resolveStatuses();
      } catch {
        // ignore; a later change re-triggers this
      } finally {
        resolving.current = false;
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [orders, ready, demo, resolveStatuses]);

  // Keep the right-hand phone preview on the same screen as the real app.
  // The real app broadcasts which screen it is on; the preview follows it and
  // never drives navigation itself. The heavy in-app shop browser is left out
  // of the mirror so a shop page (and its bot checks) never loads twice.
  useEffect(() => {
    if (IS_MIRROR) {
      const off = onMirror((m) => {
        if (m.type !== 'nav') return;
        const n = m.payload as { tab: Tab; compareQuery: string; offersFor: Listing | null };
        setTab(n.tab);
        setCompareQuery(n.compareQuery);
        setOffersFor(n.offersFor);
      });
      postMirror({ type: 'hello' });
      return off;
    }
    postMirror({ type: 'nav', payload: { tab, compareQuery, offersFor } });
    return onMirror((m) => {
      if (m.type === 'hello') postMirror({ type: 'nav', payload: { tab, compareQuery, offersFor } });
    });
  }, [tab, compareQuery, offersFor]);

  const now = Date.now();
  const urgentCount = visibleOrders.filter((o) => returnInfo(o, now).urgency === 'urgent').length;

  // Open a shop's own site inside the app, and note it so the home screen can offer "Continue shopping".
  const openShop = (siteId: string, url: string) => {
    rememberPage(siteId, url);
    setBrowser({ siteId, url, mode: 'shop' });
  };

  const signedIn = (siteId: string) => {
    setBrowser(null);
    const site = siteById(siteId);
    if (!site) return;
    // Trust the user for now; the sync flips this back if the site still shows its login page.
    setConnected(siteId, true);
    syncSite(site);
    setTab('orders');
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }} pointerEvents={IS_MIRROR ? 'none' : 'auto'}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {tab === 'orders' && (
          <OrdersScreen
            onCompare={(q) => {
              setCompareQuery(q);
              setTab('compare');
            }}
            onOpenUrl={openShop}
            onGoAccounts={() => setTab('accounts')}
          />
        )}
        {tab === 'compare' && <CompareScreen initialQuery={compareQuery} onOffers={setOffersFor} />}
        {tab === 'accounts' && <AccountsScreen onConnect={(site) => setBrowser({ siteId: site.id, url: site.ordersUrl, mode: 'login' })} />}
      </View>

      <View style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TabBtn label="Home" icon="🏠" on={tab === 'orders'} badge={urgentCount} onPress={() => setTab('orders')} />
        <TabBtn label="Compare" icon="🔍" on={tab === 'compare'} onPress={() => setTab('compare')} />
        <TabBtn label="My shops" icon="🏬" on={tab === 'accounts'} onPress={() => setTab('accounts')} />
      </View>

      {offersFor && (
        <OffersModal
          listing={offersFor}
          onClose={() => setOffersFor(null)}
          onProceed={() => {
            openShop(offersFor.siteId, offersFor.url);
            setOffersFor(null);
          }}
        />
      )}
      {browser && !IS_MIRROR && (
        <SiteBrowser
          {...browser}
          onClose={() => setBrowser(null)}
          onSignedIn={() => signedIn(browser.siteId)}
          onCompare={(name) => {
            setBrowser(null);
            setCompareQuery(name);
            setTab('compare');
          }}
        />
      )}
    </View>
  );
}

function TabBtn(props: { label: string; icon: string; on: boolean; badge?: number; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: props.on }}>
      <View>
        <Text style={{ fontSize: 20, opacity: props.on ? 1 : 0.55 }}>{props.icon}</Text>
        {props.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{props.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.tabLabel, props.on && { color: C.primary }]}>{props.label}</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <ScrapeHost>
          <ToastHost>
            <Root />
          </ToastHost>
        </ScrapeHost>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.card, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' },
  tabLabel: { fontSize: 12, fontWeight: '700', color: C.muted },
  badge: { position: 'absolute', top: -4, right: -14, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
