import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from './context/CartContext';
import { useWishlist } from './hooks/useWishlist';
import { API_BASE, toList } from './lib/api';
import { clearToken } from './lib/auth';
import { formatINR } from './lib/money';
import { primaryImage } from './lib/images';

const NAV_LINKS = [
  { to: '/products', label: 'All Products' },
  { to: '/products?category=Laptops', label: 'Laptops' },
  { to: '/products?category=Smartphones', label: 'Smartphones' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

const Nav = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const { cartCount, setIsCartOpen } = useCart();
  const { count: wishlistCount } = useWishlist();
  const navigate = useNavigate();
  const searchRef = useRef(null);

  const auth = localStorage.getItem('token');
  const vendorAuth = localStorage.getItem('vendorToken');

  const handleLogout = () => {
    // Only the auth keys. localStorage.clear() also wiped the wishlist and any
    // half-finished signup, which signing out has no business deleting.
    clearToken('customer');
    clearToken('vendor');
    window.location.href = '/';
  };

  /* ------------------------------------------------- search suggestions */
  // Debounced: one request 250ms after typing stops, not one per keystroke.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/api/v1/products?search=${encodeURIComponent(term)}&limit=5`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setSuggestions(toList(data));
        })
        .catch(() => {
          /* Aborted or offline — the form still submits to the results page. */
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort(); // cancels the in-flight request for a stale term
    };
  }, [query]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    const onClick = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const goToResults = (term) => {
    setShowSuggestions(false);
    setHighlighted(-1);
    navigate(`/products?search=${encodeURIComponent(term)}`);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    if (query.trim()) goToResults(query.trim());
  };

  const handleKeyDown = (event) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((i) => (i + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === 'Enter' && highlighted >= 0) {
      event.preventDefault();
      setShowSuggestions(false);
      navigate(`/products/${suggestions[highlighted]._id}`);
    } else if (event.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl backdrop-saturate-150 border-b border-slate-200/70 text-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 gap-4 lg:gap-6">
          {/* ------------------------------------------------------- brand */}
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="ElectrOnia home">
            <span className="w-7 h-7 rounded-lg bg-brand text-white flex items-center justify-center text-[13px] font-bold shadow-sm shadow-fuchsia-500/30">E</span>
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-slate-900">ElectrOnia</span>
          </Link>

          {/* ------------------------------------------------------ search */}
          <div ref={searchRef} className="hidden md:flex flex-1 max-w-md relative">
            <form onSubmit={handleSearchSubmit} className="w-full" role="search">
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                  setHighlighted(-1);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder="Search laptops, phones, audio…"
                aria-label="Search products"
                aria-autocomplete="list"
                aria-expanded={showSuggestions && suggestions.length > 0}
                className="w-full bg-slate-100 border border-transparent text-slate-900 rounded-full pl-4 pr-10 py-1.5 text-[13px] placeholder:text-slate-500 hover:bg-slate-200/70 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none focus:placeholder:text-slate-400 transition-colors"
              />
              <button
                type="submit"
                aria-label="Search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 p-1"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
              </button>
            </form>

            {showSuggestions && suggestions.length > 0 && (
              <ul
                role="listbox"
                className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-300 rounded-2xl shadow-2xl shadow-slate-900/10 overflow-hidden z-50"
              >
                {suggestions.map((product, index) => (
                  <li key={product._id} role="option" aria-selected={index === highlighted}>
                    <Link
                      to={`/products/${product._id}`}
                      onClick={() => {
                        setShowSuggestions(false);
                        setQuery('');
                      }}
                      onMouseEnter={() => setHighlighted(index)}
                      className={`flex items-center gap-3 px-3 py-2.5 border-l-2 ${index === highlighted ? 'bg-slate-50 border-blue-600' : 'border-transparent'}`}
                    >
                      <img
                        src={primaryImage(product)}
                        alt=""
                        className="w-9 h-9 object-contain bg-slate-50 rounded border border-slate-100 p-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-900 truncate">{product.title}</p>
                        <p className="label-mono text-slate-400">{product.brand}</p>
                      </div>
                      <span className="font-mono text-[11px] font-medium text-slate-900 shrink-0 tabular-nums">
                        {product.priceLabel ?? formatINR(product.price)}
                      </span>
                    </Link>
                  </li>
                ))}
                <li>
                  <button
                    onClick={() => goToResults(query.trim())}
                    className="w-full text-left px-3 py-2 text-[12px] font-medium text-blue-600 hover:bg-slate-50 border-t border-slate-200"
                  >
                    See all results for “{query.trim()}”
                  </button>
                </li>
              </ul>
            )}
          </div>

          {/* -------------------------------------------------------- links */}
          <nav className="hidden lg:flex items-center gap-6 text-[13px] shrink-0">
            {NAV_LINKS.map((link) => (
              <Link key={link.label} to={link.to} className="text-slate-600 hover:text-slate-900 transition-colors">
                {link.label}
              </Link>
            ))}
          </nav>

          {/* ------------------------------------------------------ actions */}
          <div className="flex items-center gap-2 shrink-0">
            <IconButton to="/wishlist" label="Wishlist" count={wishlistCount}>
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 000-7.8z" />
              </svg>
            </IconButton>

            <button
              onClick={() => setIsCartOpen(true)}
              aria-label={`Cart, ${cartCount} items`}
              className="relative p-2 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 2l1.5 3h9L18 2M3 6h18l-1.7 11.4A2 2 0 0117.3 19H6.7a2 2 0 01-2-1.6L3 6z" />
              </svg>
              {cartCount > 0 && <CountDot value={cartCount} />}
            </button>

            {vendorAuth ? (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  to="/vendor/dashboard"
                  className="bg-slate-100 text-slate-900 border border-transparent px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-slate-200 transition-colors"
                >
                  Dashboard
                </Link>
                <button onClick={handleLogout} className="text-slate-400 hover:text-slate-900 text-xs font-medium px-2 transition-colors">
                  Sign out
                </button>
              </div>
            ) : auth ? (
              <div className="hidden sm:flex items-center gap-2">
                <Link to="/orders" className="text-slate-600 hover:text-slate-900 text-xs font-medium px-2 transition-colors">
                  Orders
                </Link>
                <Link
                  to="/profile"
                  className="bg-slate-100 hover:bg-slate-200 text-slate-900 px-3 py-1.5 rounded-md text-xs font-medium border border-transparent transition-colors"
                >
                  Profile
                </Link>
                <button onClick={handleLogout} className="text-slate-400 hover:text-slate-900 text-xs font-medium px-2 transition-colors">
                  Sign out
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1">
                <Link to="/logincustomer" className="text-slate-600 hover:text-slate-900 text-xs font-medium px-3 py-1.5 transition-colors">
                  Sign in
                </Link>
                <Link
                  to="/signupcustomer"
                  className="bg-brand hover:opacity-90 text-white font-medium px-4 py-1.5 rounded-full text-xs transition-opacity shadow-sm shadow-fuchsia-500/30"
                >
                  Register
                </Link>
                <Link to="/signupvendor" className="text-xs font-medium text-slate-500 hover:text-slate-900 px-2 py-1.5 transition-colors">
                  Sell with us
                </Link>
              </div>
            )}

            <button
              onClick={() => setIsMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
              className="lg:hidden p-2 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                {isMenuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {/* -------------------------------------------------- mobile menu */}
        {isMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 py-3 flex flex-col gap-1">
            <form onSubmit={handleSearchSubmit} className="mb-2" role="search">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products…"
                aria-label="Search products"
                className="w-full bg-slate-100 border border-transparent text-slate-900 placeholder:text-slate-500 rounded-full px-4 py-2 text-[13px] focus:bg-white focus:outline-none"
              />
            </form>

            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-slate-900 py-1.5 text-[13px] transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <Link to="/wishlist" onClick={() => setIsMenuOpen(false)} className="text-slate-600 hover:text-slate-900 py-1.5 text-[13px] transition-colors">
              Wishlist {wishlistCount > 0 && `(${wishlistCount})`}
            </Link>

            <div className="border-t border-slate-200 mt-2 pt-2 flex flex-col gap-1">
              {vendorAuth ? (
                <>
                  <Link to="/vendor/dashboard" onClick={() => setIsMenuOpen(false)} className="text-slate-600 hover:text-slate-900 py-1.5 text-[13px] transition-colors">
                    Vendor dashboard
                  </Link>
                  <button onClick={handleLogout} className="text-left text-slate-600 hover:text-slate-900 py-1.5 text-[13px] transition-colors">Sign out</button>
                </>
              ) : auth ? (
                <>
                  <Link to="/orders" onClick={() => setIsMenuOpen(false)} className="text-slate-600 hover:text-slate-900 py-1.5 text-[13px] transition-colors">Orders</Link>
                  <Link to="/profile" onClick={() => setIsMenuOpen(false)} className="text-slate-600 hover:text-slate-900 py-1.5 text-[13px] transition-colors">Profile</Link>
                  <button onClick={handleLogout} className="text-left text-slate-600 hover:text-slate-900 py-1.5 text-[13px] transition-colors">Sign out</button>
                </>
              ) : (
                <>
                  <Link to="/logincustomer" onClick={() => setIsMenuOpen(false)} className="text-slate-600 hover:text-slate-900 py-1.5 text-[13px] transition-colors">Sign in</Link>
                  <Link to="/signupcustomer" onClick={() => setIsMenuOpen(false)} className="text-blue-600 font-semibold py-1.5 text-[13px]">Create account</Link>
                  <Link to="/signupvendor" onClick={() => setIsMenuOpen(false)} className="text-slate-500 py-1.5 text-[13px]">Sell with us</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

function IconButton({ to, label, count, children }) {
  return (
    <Link
      to={to}
      aria-label={count ? `${label}, ${count} items` : label}
      className="relative p-2 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors hidden sm:inline-flex"
    >
      {children}
      {count > 0 && <CountDot value={count} />}
    </Link>
  );
}

function CountDot({ value }) {
  return (
    <span className="absolute -top-0.5 -right-0.5 bg-brand text-white text-[10px] font-semibold min-w-[1.125rem] h-[1.125rem] px-1 rounded-full flex items-center justify-center tabular-nums">
      {value > 99 ? '99+' : value}
    </span>
  );
}

export default Nav;
