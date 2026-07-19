import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wheat,
  Truck,
  Warehouse,
  Handshake,
  ShieldCheck,
  Scale,
  BarChart3,
  ArrowRight,
  Phone,
  MapPin,
  Star,
  CheckCircle2,
  Menu,
  X,
} from 'lucide-react';
import api from '../services/api';
const companyPhone = import.meta.env.VITE_COMPANY_PHONE || '';
const companyAddress = import.meta.env.VITE_COMPANY_ADDRESS || 'Hala, Sindh, Pakistan';
const services = [
  ['Cotton Trading', 'Quality-based cotton buying and selling with transparent weighing and payment records.', Wheat],
  ['Wheat Trading', 'Bulk wheat procurement and sales for farmers, mills and business partners.', Scale],
  ['Fertilizer Trading', 'DAP, urea and agricultural inputs with reliable availability.', ShieldCheck],
  ['Transport Services', 'Coordinated loading, unloading and delivery across villages and markets.', Truck],
  ['Warehouse Services', 'Secure stock handling, warehouse tracking and minimum-stock monitoring.', Warehouse],
  ['Commission Agent', 'Professional market coordination and commission-based trading services.', Handshake],
];
const products = [
  {
    name: 'Cotton',
    grade: 'A, B and commercial grades',
    quality: 'Moisture and staple quality checked',
    stock: 'Price inquiry available',
    img: 'https://images.unsplash.com/photo-1595150358733-9a9f1d9a3d65?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Wheat',
    grade: 'Food and milling quality',
    quality: 'Clean, graded and weighed',
    stock: 'Bulk stock available',
    img: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'DAP',
    grade: 'Agricultural fertilizer',
    quality: 'Verified supplier stock',
    stock: 'Bag-wise availability',
    img: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Urea',
    grade: 'Agricultural fertilizer',
    quality: 'Sealed branded bags',
    stock: 'Wholesale inquiry',
    img: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=900&q=80',
  },
];
function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed z-50 w-full px-4">
      <nav className="glass mx-auto mt-4 flex max-w-7xl items-center justify-between rounded-2xl px-5 py-3">
        <a href="#home" className="flex items-center gap-3 font-black">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-green-700 text-white">
            <Wheat />
          </span>
          <span>HMN Agri Trade</span>
        </a>
        <div className="hidden gap-6 text-sm font-bold lg:flex">
          {['home', 'about', 'services', 'products', 'gallery', 'contact'].map((x) => (
            <a key={x} href={`#${x}`} className="capitalize hover:text-green-700">
              {x}
            </a>
          ))}
          <a href="/admin/login">Admin</a>
        </div>
        <button onClick={() => setOpen(!open)} className="lg:hidden">
          {open ? <X /> : <Menu />}
        </button>
      </nav>
      {open && (
        <div className="glass mx-auto mt-2 max-w-7xl rounded-2xl p-4 lg:hidden">
          {['home', 'about', 'services', 'products', 'gallery', 'contact'].map((x) => (
            <a key={x} onClick={() => setOpen(false)} className="block p-3 capitalize" href={`#${x}`}>
              {x}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
const Fade = ({ children, className = '' }) => (
  <motion.div
    initial={{ opacity: 0, y: 25 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.55 }}
    className={className}
  >
    {children}
  </motion.div>
);
export default function PublicSite() {
  const submit = async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      await api.post('/leads', Object.fromEntries(new FormData(f)));
      alert('Inquiry submitted successfully');
      f.reset();
    } catch (err) {
      alert(err.response?.data?.message || 'Unable to submit inquiry');
    }
  };
  return (
    <>
      <Nav />
      <main>
        <section
          id="home"
          className="relative min-h-screen bg-[url('https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=2000&q=85')] bg-cover bg-center"
        >
          <div className="hero-overlay absolute inset-0" />
          <div className="relative mx-auto grid min-h-screen max-w-7xl items-center px-6 pt-28 lg:grid-cols-[1.15fr_.85fr]">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl text-white">
              <p className="mb-5 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold">
                Sindh's professional agriculture trading partner
              </p>
              <h1 className="text-5xl font-black leading-[1.04] md:text-7xl">
                Trade agriculture with trust, speed and complete control.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-green-50">
                Cotton, wheat, fertilizer, transport, warehouse and commission services—supported by a modern digital
                business system.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="#contact"
                  className="inline-flex items-center gap-2 rounded-2xl bg-lime-400 px-6 py-4 font-black text-green-950"
                >
                  Request a Quote <ArrowRight size={18} />
                </a>
                <a href="#products" className="rounded-2xl border border-white/30 bg-white/10 px-6 py-4 font-black">
                  Explore Products
                </a>
              </div>
            </motion.div>
            <div className="hidden lg:block">
              <div className="glass shadow-premium rounded-[2rem] p-6">
                <div className="rounded-[1.5rem] bg-green-950 p-7 text-white">
                  <p className="text-sm text-green-300">Business intelligence</p>
                  <h2 className="mt-2 text-3xl font-black">HMN Trade Platform</h2>
                  <div className="mt-7 grid grid-cols-2 gap-4">
                    {[
                      ['42,500 kg', 'Cotton Stock'],
                      ['18', 'Active Villages'],
                      ['500+', 'Farmer Accounts'],
                      ['24/7', 'Trade Support'],
                    ].map(([a, b]) => (
                      <div key={b} className="rounded-2xl bg-white/10 p-4">
                        <div className="text-xl font-black">{a}</div>
                        <div className="text-xs text-green-200">{b}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="bg-green-950 px-6 py-9 text-white">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 text-center md:grid-cols-4">
            {[
              ['15+', 'Years of trust'],
              ['500+', 'Farmer accounts'],
              ['18', 'Villages served'],
              ['99%', 'Transparent records'],
            ].map(([n, t]) => (
              <Fade key={t}>
                <div className="text-3xl font-black text-lime-300">{n}</div>
                <div className="text-sm text-green-100">{t}</div>
              </Fade>
            ))}
          </div>
        </section>
        <section id="about" className="grid-bg px-6 py-24">
          <div className="mx-auto max-w-7xl">
            <Fade className="grid gap-14 lg:grid-cols-2">
              <div>
                <p className="font-black uppercase tracking-[.22em] text-green-700">Company story</p>
                <h2 className="mt-4 text-4xl font-black md:text-6xl">
                  Built from local trust. Ready for modern trade.
                </h2>
                <p className="mt-6 text-lg leading-8 text-slate-600">
                  HMN Agri Trade serves farmers, suppliers and commercial buyers around Hala and surrounding villages.
                  Our focus is honest weighing, clear khata records, timely payments and dependable product
                  availability.
                </p>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-white p-6 shadow-premium">
                    <h3 className="text-xl font-black">Mission</h3>
                    <p className="mt-2 text-slate-600">
                      Make agriculture trade transparent, efficient and profitable for every partner.
                    </p>
                  </div>
                  <div className="rounded-3xl bg-white p-6 shadow-premium">
                    <h3 className="text-xl font-black">Vision</h3>
                    <p className="mt-2 text-slate-600">
                      Become Sindh's most trusted digitally managed agriculture trading network.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <img
                  alt="Agricultural field and farming operations"
                  className="h-72 w-full rounded-3xl object-cover"
                  src="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=800&q=80"
                />
                <img
                  alt="HMN agriculture trading operations"
                  className="mt-10 h-72 w-full rounded-3xl object-cover"
                  src="https://images.unsplash.com/photo-1592982537447-6f2a6a0c7a3c?auto=format&fit=crop&w=800&q=80"
                />
              </div>
            </Fade>
          </div>
        </section>
        <section id="services" className="bg-white px-6 py-24">
          <div className="mx-auto max-w-7xl">
            <Fade className="mx-auto max-w-3xl text-center">
              <p className="font-black uppercase tracking-[.22em] text-green-700">Services</p>
              <h2 className="mt-3 text-4xl font-black md:text-6xl">Complete agriculture trade support</h2>
            </Fade>
            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {services.map(([a, b, I]) => (
                <Fade key={a}>
                  <article className="h-full rounded-3xl border border-green-100 bg-green-50/40 p-8 transition hover:-translate-y-1 hover:shadow-premium">
                    <I className="text-green-700" size={36} />
                    <h3 className="mt-5 text-2xl font-black">{a}</h3>
                    <p className="mt-3 leading-7 text-slate-600">{b}</p>
                  </article>
                </Fade>
              ))}
            </div>
          </div>
        </section>
        <section id="products" className="bg-slate-950 px-6 py-24 text-white">
          <div className="mx-auto max-w-7xl">
            <Fade>
              <p className="font-black uppercase tracking-[.22em] text-lime-300">Products</p>
              <h2 className="mt-3 text-4xl font-black md:text-6xl">Quality products, clear specifications</h2>
            </Fade>
            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {products.map((p) => (
                <Fade key={p.name}>
                  <article className="overflow-hidden rounded-3xl bg-white/10">
                    <img src={p.img} alt={p.name} className="h-52 w-full object-cover" />
                    <div className="p-6">
                      <h3 className="text-2xl font-black">{p.name}</h3>
                      <p className="mt-4 text-sm text-slate-300">Grade: {p.grade}</p>
                      <p className="mt-2 text-sm text-slate-300">Quality: {p.quality}</p>
                      <p className="mt-2 text-sm font-bold text-lime-300">{p.stock}</p>
                      <a href="#contact" className="mt-5 inline-flex items-center gap-2 font-black">
                        Price inquiry <ArrowRight size={16} />
                      </a>
                    </div>
                  </article>
                </Fade>
              ))}
            </div>
          </div>
        </section>
        <section className="px-6 py-24">
          <div className="mx-auto max-w-7xl">
            <Fade className="text-center">
              <p className="font-black uppercase tracking-[.22em] text-green-700">Why HMN</p>
              <h2 className="mt-3 text-4xl font-black md:text-6xl">Business built on accountability</h2>
            </Fade>
            <div className="mt-14 grid gap-6 md:grid-cols-4">
              {['Accurate weighing', 'Transparent khata', 'Fast settlement', 'Village-wise records'].map((x) => (
                <div key={x} className="rounded-3xl bg-white p-7 shadow-premium">
                  <CheckCircle2 className="text-green-700" />
                  <h3 className="mt-4 text-xl font-black">{x}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="bg-green-50 px-6 py-24">
          <div className="mx-auto max-w-7xl">
            <Fade className="text-center">
              <p className="font-black uppercase tracking-[.22em] text-green-700">Trusted partners</p>
              <div className="mt-9 grid grid-cols-2 gap-4 md:grid-cols-5">
                {['Farmers', 'Ginners', 'Flour Mills', 'Fertilizer Dealers', 'Transporters'].map((x) => (
                  <div key={x} className="rounded-2xl bg-white p-6 font-black shadow-sm">
                    {x}
                  </div>
                ))}
              </div>
            </Fade>
            <div className="mt-16 grid gap-6 md:grid-cols-3">
              {[
                'HMN keeps our weighing and payment records clear.',
                'Reliable fertilizer stock and quick coordination.',
                'The digital khata system makes business much easier.',
              ].map((x, i) => (
                <Fade key={x}>
                  <div className="rounded-3xl bg-white p-8 shadow-premium">
                    <div className="flex text-amber-500">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} size={17} fill="currentColor" />
                      ))}
                    </div>
                    <p className="mt-5 text-lg leading-8">“{x}”</p>
                    <p className="mt-5 font-black">Business Partner {i + 1}</p>
                  </div>
                </Fade>
              ))}
            </div>
          </div>
        </section>
        <section id="gallery" className="bg-white px-6 py-24">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-4xl font-black md:text-6xl">Trade & operations gallery</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                'photo-1464226184884-fa280b87c399',
                'photo-1523348837708-15d4a09cfac2',
                'photo-1500382017468-9049fed747ef',
                'photo-1499529112087-3cb3b73cec95',
                'photo-1592982537447-6f2a6a0c7a3c',
                'photo-1625246333195-78d9c38ad449',
              ].map((id, i) => (
                <img
                  key={id}
                  alt={`Agriculture operations gallery ${i + 1}`}
                  className={`h-72 w-full rounded-3xl object-cover ${i === 0 ? 'md:col-span-2' : ''}`}
                  src={`https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&q=80`}
                />
              ))}
            </div>
          </div>
        </section>
        <section className="bg-green-800 px-6 py-16 text-white">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-4xl font-black">Ready to start a reliable trade?</h2>
              <p className="mt-2 text-green-100">Speak with HMN Agri Trade for current rates and availability.</p>
            </div>
            <a href="#contact" className="rounded-2xl bg-lime-300 px-6 py-4 font-black text-green-950">
              Get today’s quote
            </a>
          </div>
        </section>
        <section id="contact" className="px-6 py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2">
            <div>
              <p className="font-black uppercase tracking-[.22em] text-green-700">Contact</p>
              <h2 className="mt-3 text-5xl font-black">Work with HMN Agri Trade</h2>
              <p className="mt-5 text-lg text-slate-600">
                Submit an inquiry for cotton, wheat, fertilizer, warehouse or business partnership.
              </p>
              <div className="mt-8 space-y-4">
                {companyPhone && (
                  <p className="flex gap-3">
                    <Phone /> {companyPhone}
                  </p>
                )}
                <p className="flex gap-3">
                  <MapPin /> {companyAddress}
                </p>
              </div>
            </div>
            <form onSubmit={submit} className="rounded-[2rem] bg-white p-8 shadow-premium">
              <input name="name" required placeholder="Full name" className="input mb-4" />
              <input name="phone" required placeholder="Phone number" className="input mb-4" />
              <input name="village" placeholder="Village / City" className="input mb-4" />
              <select name="interest" className="input mb-4">
                <option>Cotton</option>
                <option>Wheat</option>
                <option>Fertilizer</option>
                <option>Transport</option>
                <option>Warehouse</option>
                <option>Commission Agent</option>
              </select>
              <textarea name="message" rows="5" placeholder="Message" className="input mb-4" />
              <button className="w-full rounded-2xl bg-green-700 px-6 py-4 font-black text-white">
                Submit Inquiry
              </button>
            </form>
          </div>
        </section>
      </main>
      <footer className="bg-slate-950 px-6 py-10 text-center text-slate-400">
        © 2026 HMN Agri Trade · Hala, Sindh, Pakistan
      </footer>
    </>
  );
}
