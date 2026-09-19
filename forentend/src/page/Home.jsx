import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { Reveal, WordsUp, useScrollProgress } from '../components/motion';
import { shapeImage } from '../lib/images';
import { colorFor } from '../lib/palette';
import { API_BASE, toList } from '../lib/api';
import { Button, SkeletonGrid, ErrorState, SectionHeading } from '../components/ui';

const CATEGORIES = [
  { name: 'Laptops', shape: 'laptop', colorway: 'silver', view: 'angle' },
  { name: 'Smartphones', shape: 'phone-island', colorway: 'titanium', view: 'front' },
  { name: 'Audio', shape: 'headphones', colorway: 'porcelain', view: 'front' },
  { name: 'Wearables', shape: 'watch', colorway: 'midnight', view: 'front' },
  { name: 'Gaming', shape: 'controller', colorway: 'porcelain', view: 'front' },
  { name: 'Accessories', shape: 'charger', colorway: 'porcelain', view: 'front' },
];

/** Two large feature tiles under the hero — one dark, one light. */
const FEATURE_TILES = [
  {
    category: 'Laptops',
    dark: true,
    bg: 'bg-gradient-to-br from-[#0B1026] via-[#1E1B4B] to-[#4C1D95]',
    title: 'Laptops',
    line: 'Thin, fast, and ready for anything.',
    image: shapeImage('laptop', 'silver', 'angle'),
  },
  {
    category: 'Audio',
    dark: false,
    bg: 'bg-gradient-to-br from-[#FFE4E6] via-[#FCE7F3] to-[#EDE9FE]',
    title: 'Audio',
    line: 'Hear every detail. Or nothing at all.',
    image: shapeImage('headphones', 'ultramarine', 'front'),
  },
];

const Home = () => {
  const [featured, setFeatured] = useState({ status: 'loading', items: [] });
  const [newest, setNewest] = useState([]);

  const load = useCallback(async () => {
    setFeatured({ status: 'loading', items: [] });
    try {
      const res = await fetch(`${API_BASE}/api/v1/products?featured=true&limit=8`);
      if (!res.ok) throw new Error((await res.json())?.error?.message || 'Request failed');

      const items = toList(await res.json());

      // Nothing flagged as featured yet — fall back to the newest arrivals so
      // the homepage is never empty on a fresh install.
      if (items.length === 0) {
        const fallback = await fetch(`${API_BASE}/api/v1/products?limit=8`).then((r) => r.json());
        setFeatured({ status: 'ready', items: toList(fallback) });
      } else {
        setFeatured({ status: 'ready', items });
      }
    } catch (err) {
      setFeatured({ status: 'error', items: [], message: err.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/products?sort=newest&limit=4`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setNewest(toList(data));
      })
      .catch(() => setNewest([]));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-20 -mt-6">
      <Hero />

      {/* ------------------------------------------------ category shelf */}
      <section className="flex flex-col gap-6">
        <Reveal>
          <h2 className="text-3xl sm:text-[40px] font-bold leading-[1.08]">
            Shop by category. <span className="text-slate-400">Find your next favourite thing.</span>
          </h2>
        </Reveal>
        <div className="flex lg:grid lg:grid-cols-6 gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 pb-2 snap-x">
          {CATEGORIES.map((category, index) => (
            <Reveal key={category.name} delay={index * 60} className="snap-start shrink-0">
              <Link
                to={`/products?category=${category.name}`}
                className={`group flex flex-col items-center gap-3 w-36 sm:w-40 lg:w-auto rounded-3xl ${colorFor(category.name).tint} pt-5 pb-4 transition-all duration-500 hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.2)] hover:-translate-y-1`}
              >
                <div className="glow-behind" style={{ '--glow': colorFor(category.name).glow }}>
                <img
                  src={shapeImage(category.shape, category.colorway, category.view)}
                  alt=""
                  loading="lazy"
                  className="relative product-shadow w-28 h-20 object-contain transition-transform duration-700 group-hover:scale-110"
                />
                </div>
                <span className={`text-[14px] font-semibold text-slate-900 transition-colors ${colorFor(category.name).hoverText}`}>{category.name}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------- feature tiles */}
      <section className="grid md:grid-cols-2 gap-4">
        {FEATURE_TILES.map((tile, index) => (
          <Reveal key={tile.title} delay={index * 120}>
            <Link
              to={`/products?category=${tile.category}`}
              className={`group relative flex flex-col items-center text-center overflow-hidden rounded-[28px] pt-12 px-6 min-h-[480px] ${
                `${tile.bg} ${tile.dark ? 'text-white' : 'text-slate-900'}`
              }`}
            >
              <span className={`absolute w-72 h-72 rounded-full blur-3xl opacity-60 bottom-0 ${tile.dark ? 'bg-fuchsia-500/40' : 'bg-orange-300/50'}`} aria-hidden="true" />
              <h3 className="relative text-[40px] font-bold tracking-[-0.03em] leading-none">{tile.title}</h3>
              <p className={`relative mt-2 text-[19px] ${tile.dark ? 'text-violet-200' : 'text-slate-600'}`}>{tile.line}</p>
              <div className="relative mt-5 flex items-center gap-5 text-[15px]">
                <span className={`rounded-full px-5 py-2 font-medium transition-colors ${tile.dark ? 'bg-white text-slate-900 group-hover:bg-violet-100' : 'bg-slate-900 text-white group-hover:bg-violet-700'}`}>Shop now</span>
                <span className={tile.dark ? 'text-violet-300' : 'text-violet-700'}>Browse all ›</span>
              </div>
              <img
                src={tile.image}
                alt=""
                loading="lazy"
                className="relative product-shadow mt-auto w-[88%] max-w-md object-contain translate-y-6 transition-transform duration-[1200ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-y-0 group-hover:scale-[1.04]"
              />
            </Link>
          </Reveal>
        ))}
      </section>

      {/* ------------------------------------------------------- featured */}
      <section className="flex flex-col gap-6">
        <Reveal>
          <SectionHeading
            title="Featured."
            subtitle="Hand-picked from across our sellers."
            action={
              <Link to="/products" className="text-[15px] text-blue-600 hover:underline underline-offset-4 shrink-0">
                See all products ›
              </Link>
            }
          />
        </Reveal>

        {featured.status === 'loading' && <SkeletonGrid count={8} />}
        {featured.status === 'error' && <ErrorState message={featured.message} onRetry={load} />}
        {featured.status === 'ready' && (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {featured.items.map((product, index) => (
              <Reveal key={product._id} delay={(index % 4) * 70}>
                <ProductCard product={product} />
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- newest */}
      {newest.length > 0 && (
        <section className="flex flex-col gap-6">
          <Reveal>
            <SectionHeading title="Just in." subtitle="The newest arrivals in the store." />
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {newest.map((product, index) => (
              <Reveal key={product._id} delay={index * 70}>
                <ProductCard product={product} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- why us */}
      <section className="flex flex-col gap-6">
        <Reveal>
          <h2 className="text-3xl sm:text-[40px] font-bold leading-[1.08]">
            Why ElectrOnia. <span className="text-gradient">Shopping that just works.</span>
          </h2>
        </Reveal>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { grad: 'from-emerald-400 to-cyan-500', icon: 'M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z M9 12l2 2 4-4', title: 'Verified sellers', body: 'Every seller is reviewed before their first listing goes live.' },
            { grad: 'from-violet-500 to-fuchsia-500', icon: 'M3 7l9-4 9 4-9 4-9-4z M3 7v10l9 4 9-4V7 M12 11v10', title: 'Every package tracked', body: 'Order from three sellers, get three tracking numbers — each updates on its own.' },
            { grad: 'from-orange-400 to-pink-500', icon: 'M4 7h16M4 12h16M4 17h10', title: 'One bag, one checkout', body: 'Mix sellers freely. Totals are worked out by the server, so what you see is what you pay.' },
          ].map((item, index) => (
            <Reveal key={item.title} delay={index * 90}>
              <div className="h-full rounded-3xl bg-slate-50 p-7 flex flex-col gap-3 transition-all duration-500 hover:bg-white hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.18)]">
                <span className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.grad} flex items-center justify-center shadow-lg shadow-slate-900/10`}>
                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={item.icon} />
                  </svg>
                </span>
                <h3 className="text-[21px] font-semibold">{item.title}</h3>
                <p className="text-[15px] text-slate-600 leading-relaxed">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ Hero */

/**
 * Big centred headline whose words rise in, two actions, and a trio of
 * products that float and scale up as you scroll into them.
 */
function Hero() {
  const stage = useScrollProgress();
  return (
    <section className="bleed relative bg-gradient-to-b from-white via-white to-slate-50 overflow-hidden">
      {/* Colour fields, drifting slowly behind everything. */}
      <div className="absolute inset-0 -z-0" aria-hidden="true">
        <span className="blob blob-a bg-blue-400 w-[420px] h-[420px] -left-24 top-10" />
        <span className="blob blob-b bg-fuchsia-400 w-[380px] h-[380px] right-[-80px] top-24" />
        <span className="blob blob-c bg-orange-300 w-[340px] h-[340px] left-1/3 top-[420px]" />
      </div>
      <div className="relative max-w-5xl mx-auto px-4 pt-16 sm:pt-24 text-center flex flex-col items-center gap-5">
        <Reveal className="inline-flex items-center gap-2 rounded-full bg-white/80 backdrop-blur px-4 py-1.5 text-[13px] font-semibold shadow-sm ring-1 ring-slate-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
          <span className="text-gradient">New sellers joining every week</span>
        </Reveal>

        <h1 className="text-[44px] leading-[1.04] sm:text-[72px] sm:leading-[1.02] font-bold tracking-[-0.035em] text-slate-900">
          <WordsUp text="Everything electronic." start={100} />
          <br />
          <WordsUp text="All in one bag." start={400} className="pb-2" wordClassName="text-gradient" />
        </h1>

        <Reveal delay={700} as="p" className="text-[19px] sm:text-[21px] text-slate-600 max-w-2xl leading-snug">
          Laptops, phones, audio and gaming gear from verified independent sellers — with one checkout and every shipment tracked.
        </Reveal>

        <Reveal delay={850} className="flex flex-wrap items-center justify-center gap-4 pt-1">
          <Link to="/products" className="bg-brand text-white rounded-full px-8 py-3 text-[16px] font-medium shadow-lg shadow-fuchsia-500/25 hover:shadow-xl hover:shadow-fuchsia-500/35 hover:-translate-y-0.5 transition-all duration-300">Shop now</Link>
          <Link to="/signupvendor" className="text-[17px] text-blue-600 hover:underline underline-offset-4">Sell with us ›</Link>
        </Reveal>
      </div>

      <div ref={stage} className="scroll-scale relative z-[1] max-w-5xl mx-auto h-[260px] sm:h-[440px] mt-10">
        <img src={shapeImage('phone-island', 'signal', 'angle')} alt="" className="product-shadow float absolute left-[2%] sm:left-[6%] bottom-6 w-[26%] object-contain" style={{ animationDelay: '-2s' }} />
        <img src={shapeImage('laptop', 'silver', 'angle')} alt="" className="product-shadow float absolute inset-x-0 mx-auto bottom-0 w-[62%] object-contain" />
        <img src={shapeImage('headphones', 'ultramarine', 'front')} alt="" className="product-shadow float absolute right-[2%] sm:right-[6%] bottom-10 w-[26%] object-contain" style={{ animationDelay: '-4s' }} />
      </div>
    </section>
  );
}

export default Home;
