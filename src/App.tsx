import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
  Link,
} from "react-router-dom";
import {
  ShogunButtonProvider,
  ShogunButton,
  useShogun,
} from "shogun-button-react";
import { shogunConnector } from "shogun-button-react";
import type { ShogunCore } from "shogun-core";
import Gun from "gun";
import "gun/sea";
import { ThemeToggle } from "./components/ui/ThemeToggle";
import { Timeline } from "./components/Timeline";
import { UserProfile } from "./components/UserProfile";
import { MyPosts } from "./components/MyPosts";
import { PostDetail } from "./components/PostDetail";

import logo from "/logo.svg";

import "./index.css";
import "shogun-relays";

// Extend window interface for ShogunRelays
declare global {
  interface Window {
    ShogunRelays: {
      forceListUpdate: (options?: any) => Promise<string[]>;
    };
    shogunDebug?: {
      clearAllData: () => void;
      sdk: ShogunCore;
      gun: any;
      relays: string[];
    };
    gun?: any;
    shogun?: ShogunCore;
  }
}

// Layout wrapper comune per tutte le pagine
interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { isLoggedIn } = useShogun();
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="navbar-custom">
        <div className="navbar-inner">
          <Link to="/" className="navbar-title">
            <img src={logo} alt="Mistodon" className="w-12 h-12" />
            <div>
              <span className="font-semibold">mistodon</span>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              to="/"
              className={`btn btn-ghost btn-sm ${location.pathname === "/" ? "btn-active" : ""}`}
            >
              Timeline
            </Link>
            {isLoggedIn && (
              <Link
                to="/profile"
                className={`btn btn-ghost btn-sm ${location.pathname.startsWith("/profile") ? "btn-active" : ""}`}
              >
                Profile
              </Link>
            )}
            {isLoggedIn && (
              <Link
                to="/my-posts"
                className={`btn btn-ghost btn-sm ${location.pathname === "/my-posts" ? "btn-active" : ""}`}
              >
                My Posts
              </Link>
            )}
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="app-main">
        <div className="flex justify-center mb-6">
          <div className={`badge-custom ${isLoggedIn ? "success" : "error"}`}>
            <span className="badge-dot" />
            <span>{isLoggedIn ? "Authenticated" : "Not authenticated"}</span>
          </div>
        </div>

        {/* Authentication Card - Only show when not logged in */}
        {!isLoggedIn && (
          <div className="card content-card mb-6 p-8">
            <div className="card-body">
              <div className="mb-4">
                <h2 className="text-2xl font-bold mb-2">Welcome to Mistodon</h2>
                <p className="text-secondary">
                  Connect with your preferred method to start posting and
                  interacting.
                </p>
              </div>
              <div className="flex justify-center">
                <ShogunButton />
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        {children}
      </main>

      <footer className="w-full py-5 px-1 mt-auto">
        <div className="w-full">
          <ul className="menu menu-horizontal w-full">
            <div className="flex justify-center items-center gap-2 text-sm w-full">
              <div className="text-center">
                <a href="https://github.com/scobru/shogun-mistodon" target="_blank" rel="noreferrer" className="link">
                  Fork me
                </a>
              </div>
              <span>·</span>
              <div className="flex justify-center items-center gap-2">
                <p className="m-0 text-center">
                  Built with 
                  <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                  at
                </p>
                <a
                  className="flex justify-center items-center gap-1"
                  href="https://shogun-eco.xyz/"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="link">Shogun Ecosystem</span>
                </a>
                <span>·</span>
                <span className="text-center">by <a href="https://github.com/scobru" target="_blank" rel="noreferrer" className="link">scobru</a></span>
              </div>
              <span>·</span>
              <div className="text-center">
                <a href="https://t.me/shogun_eco" target="_blank" rel="noreferrer" className="link">
                  Support
                </a>
              </div>
            </div>
          </ul>
        </div>
      </footer>
    </div>
  );
};

// Main component for Timeline page
const MainApp: React.FC = () => {
  return (
    <AppLayout>
      <Timeline />
    </AppLayout>
  );
};

// Wrapper for MainApp that provides access to useLocation
const MainAppWithLocation: React.FC<{ shogun: ShogunCore }> = () => {
  return <MainApp />;
};

// Wrapper for UserProfile with route params
const UserProfileWrapper: React.FC = () => {
  const { userPub } = useParams<{ userPub: string }>();
  return <UserProfile userPub={userPub} />;
};

interface ShogunAppProps {
  shogun: ShogunCore;
}

function ShogunApp({ shogun }: ShogunAppProps) {
  const providerOptions = {
    appName: "Mistodon",
    theme: "dark",
    showWebauthn: true,
    showMetamask: true,
    showNostr: true,
    showZkProof: true,
    enableGunDebug: true,
    enableConnectionMonitoring: true,
  };

  const handleLoginSuccess = (result: any) => {
    console.log("Login success:", result);
  };

  const handleError = (error: string | Error) => {
    console.error("Auth error:", error);
  };

  return (
    <Router>
      <ShogunButtonProvider
        core={shogun}
        options={providerOptions}
        onLoginSuccess={handleLoginSuccess}
        onSignupSuccess={handleLoginSuccess}
        onError={handleError}
      >
        <Routes>
          <Route path="/" element={<MainAppWithLocation shogun={shogun} />} />
          <Route path="/profile" element={<AppLayout><UserProfile /></AppLayout>} />
          <Route path="/profile/:userPub" element={<AppLayout><UserProfileWrapper /></AppLayout>} />
          <Route path="/my-posts" element={<AppLayout><MyPosts /></AppLayout>} />
          <Route path="/post/:postId" element={<AppLayout><PostDetail /></AppLayout>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ShogunButtonProvider>
    </Router>
  );
}

function App() {
  const [sdk, setSdk] = useState<ShogunCore | null>(null);
  const [relays, setRelays] = useState<string[]>([]);
  const [isLoadingRelays, setIsLoadingRelays] = useState(true);

  // First effect: fetch relays asynchronously
  useEffect(() => {
    async function fetchRelays() {
      try {
        setIsLoadingRelays(true);
        const fetchedRelays = await window.ShogunRelays.forceListUpdate({
          axe: true,
          wire: true,
          localStorage: false,
          radisk: false,
        });

        console.log("Fetched relays:", fetchedRelays);

        // Use fetched relays, or fallback to default if empty
        const peersToUse =
          fetchedRelays && fetchedRelays.length > 0
            ? fetchedRelays
            : ["https://peer.wallie.io/gun"];

        setRelays(peersToUse);
      } catch (error) {
        console.error("Error fetching relays:", error);
        // Fallback to default peer
        setRelays(["https://peer.wallie.io/gun"]);
      } finally {
        setIsLoadingRelays(false);
      }
    }

    fetchRelays();
  }, []);

  // Second effect: initialize ShogunCore only after relays are loaded
  useEffect(() => {
    if (isLoadingRelays || relays.length === 0) {
      return; // Wait for relays to be loaded
    }

    console.log("relays", relays);

    // Use shogunConnector to initialize ShogunCore
    const initShogun = async () => {
      const gun = Gun({
        peers: relays,
        localStorage: false,
        radisk: false,
        wire: true,
        axe: true,
      });

      const { core: shogunCore } = await shogunConnector({
        appName: "Mistodon",
        // Pass explicit Gun instance
        gunInstance: gun,
        // Authentication method configurations
        web3: { enabled: true },
        webauthn: {
          enabled: true,
          rpName: "Mistodon",
        },
        nostr: { enabled: true },
        zkproof: { enabled: true },
        // UI feature toggles
        showWebauthn: true,
        showNostr: true,
        showMetamask: true,
        showZkProof: true,
        // Advanced features
        enableGunDebug: true,
        enableConnectionMonitoring: true,
        defaultPageSize: 20,
        connectionTimeout: 10000,
        debounceInterval: 100,
      });

      // Add debug methods to window for testing
      if (typeof window !== "undefined") {
        // Wait a bit for Gun to initialize
        setTimeout(() => {
          console.log("ShogunCore after initialization:", shogunCore);
          const gunInstance = shogunCore.gun;
          console.log("Gun instance found:", gunInstance);

          window.shogunDebug = {
            clearAllData: () => {
              if (shogunCore.storage) {
                shogunCore.storage.clearAll();
              }
              if (typeof sessionStorage !== "undefined") {
                sessionStorage.removeItem("gunSessionData");
              }
            },
            sdk: shogunCore,
            gun: gunInstance,
            relays: relays,
          };

          window.gun = gunInstance;
          window.shogun = shogunCore;
          console.log("Debug methods available at window.shogunDebug");
          console.log(
            "Available debug methods:",
            Object.keys(window.shogunDebug)
          );
          console.log("Initialized with relays:", relays);
        }, 1000);
      }

      setSdk(shogunCore);
    };

    initShogun();
  }, [relays, isLoadingRelays]);


  if (isLoadingRelays || !sdk) {
    return (
      <div className="flex items-center justify-center h-screen flex-col gap-4">
        <span className="loading loading-lg"></span>
        <p className="text-secondary">
          {isLoadingRelays ? "Loading relays..." : "Initializing Shogun..."}
        </p>
      </div>
    );
  }

  return <ShogunApp shogun={sdk} />;
}

export default App;
