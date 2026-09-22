import React, { useState, useEffect } from 'react';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert,
  Cpu,
  ArrowRight,
  Eye,
  Crosshair,
  Zap,
  Layers,
  CheckCircle2,
  Camera,
  LineChart,
  Target,
  Database,
  Code,
  Layout,
  SlidersHorizontal,
  BellRing,
  Server,
  Menu,
  X
} from 'lucide-react';
import { AnimatedNumber } from '../components/common/AnimatedNumber';
import { HeroThermalViewport } from '../components/live/HeroThermalViewport';
import { BrandMark } from '../components/common/BrandMark';

interface LandingPageProps {
  onEnterCommandCenter: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterCommandCenter }) => {
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const [activePipelineStep, setActivePipelineStep] = useState<number>(0);
  const [activeSection, setActiveSection] = useState<string>('platform');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const isScrolledRef = React.useRef(false);

  useEffect(() => {
    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          const scrolled = scrollY > 30;
          if (isScrolledRef.current !== scrolled) {
            isScrolledRef.current = scrolled;
            setIsScrolled(scrolled);
          }

          const sections = ['platform', 'capabilities', 'pipeline', 'surveillance', 'analytics'];
          const scrollPosition = scrollY + 240;

          for (const section of sections) {
            const el = document.getElementById(section);
            if (el) {
              const top = el.offsetTop;
              const height = el.offsetHeight;
              if (scrollPosition >= top && scrollPosition < top + height) {
                setActiveSection(section);
                break;
              }
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Continuous data packet animation loop across architecture pipeline
  useEffect(() => {
    const interval = setInterval(() => {
      setActivePipelineStep((prev) => (prev + 1) % 7);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const headerOffset = 76;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;
      window.scrollTo({
        top: Math.max(0, offsetPosition),
        behavior: 'smooth',
      });
    }
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: 'easeOut' },
    },
  };

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F5F7FA] font-sans selection:bg-[#63D8E6]/20 selection:text-[#63D8E6] overflow-x-hidden">
      {/* NAVBAR */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-[#05070B]/90 backdrop-blur-2xl border-b border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.6)]'
            : 'bg-[#05070B]/70 backdrop-blur-xl border-b border-white/[0.04]'
        }`}
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,rgba(99,216,230,0.06),transparent_40%)]" />

        <div className="max-w-[1440px] mx-auto px-6 lg:px-10 h-20 flex items-center justify-between select-none relative z-10 font-sans">
          {/* Brand & Sensor Node */}
          <BrandMark onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />

          {/* Navigation Items (Desktop) */}
          <nav className="hidden md:flex items-center space-x-1 bg-white/[0.02] p-1.5 rounded-2xl border border-white/[0.05]">
            {[
              { id: 'platform', label: 'Platform' },
              { id: 'capabilities', label: 'Capabilities' },
              { id: 'pipeline', label: 'Technology' },
              { id: 'surveillance', label: 'Surveillance' },
              { id: 'analytics', label: 'Analytics' },
            ].map((nav) => {
              const isActive = activeSection === nav.id;
              return (
                <button
                  key={nav.id}
                  onClick={() => scrollToSection(nav.id)}
                  className={`px-4 py-2 rounded-xl text-[14px] font-medium transition-all duration-200 cursor-pointer relative flex items-center space-x-2 ${
                    isActive
                      ? 'text-[#F5F7FA] font-semibold bg-white/[0.06] border border-white/[0.08] shadow-sm'
                      : 'text-[#8D98AA] hover:text-[#F5F7FA] hover:bg-white/[0.035]'
                  }`}
                >
                  <span>{nav.label}</span>
                  {isActive && (
                    <motion.span
                      layoutId="landing-active-dot"
                      className="w-1.5 h-1.5 rounded-full bg-[#63D8E6] shadow-[0_0_8px_#63D8E6]"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Action & System Status */}
          <div className="hidden sm:flex items-center space-x-4">
            {/* System Status Pill */}
            <div className="hidden md:flex items-center space-x-2.5 px-3.5 py-1.5 rounded-full bg-[#68D7A5]/[0.08] border border-[#68D7A5]/25 text-xs font-sans text-[#8D98AA]">
              <span className="w-2 h-2 rounded-full bg-[#68D7A5] animate-pulse" />
              <span className="tracking-wide">
                SYSTEM STATUS: <span className="text-[#68D7A5] font-semibold">OPERATIONAL</span>
              </span>
            </div>

            {/* Primary Command Center CTA Button */}
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={onEnterCommandCenter}
              className="h-10 px-5 rounded-xl bg-[#63D8E6] hover:bg-[#7AE3EF] text-[#05070B] font-sans font-semibold text-xs transition-all shadow-[0_4px_20px_rgba(99,216,230,0.2)] flex items-center space-x-2 group cursor-pointer"
            >
              <span>ENTER COMMAND CENTER</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-200" />
            </motion.button>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex md:hidden items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#F5F7FA] cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* BOTTOM ACCENT: FAINT RECURRING SENSOR SCAN BEAM */}
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/[0.06] overflow-hidden">
          <motion.div
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            className="w-1/3 h-full bg-gradient-to-r from-transparent via-[#63D8E6] to-transparent"
          />
        </div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="md:hidden bg-[#05070B]/95 backdrop-blur-2xl border-b border-white/[0.07] px-6 py-6 space-y-4"
            >
              <div className="space-y-1 text-xs font-sans font-medium text-[#8D98AA]">
                {[
                  { id: 'platform', label: 'Platform' },
                  { id: 'capabilities', label: 'Capabilities' },
                  { id: 'pipeline', label: 'Technology' },
                  { id: 'surveillance', label: 'Surveillance' },
                  { id: 'analytics', label: 'Analytics' },
                ].map((nav) => (
                  <button
                    key={nav.id}
                    onClick={() => {
                      scrollToSection(nav.id);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left py-2.5 px-3 rounded-lg hover:bg-white/5 hover:text-[#F5F7FA] transition-colors"
                  >
                    {nav.label}
                  </button>
                ))}
              </div>

              <div className="pt-3 border-t border-white/[0.06] space-y-3">
                <div className="flex items-center space-x-2 text-xs font-sans text-[#8D98AA] bg-[#68D7A5]/[0.06] px-3.5 py-2 rounded-xl border border-[#68D7A5]/20">
                  <span className="w-2 h-2 rounded-full bg-[#68D7A5]" />
                  <span>SYSTEM STATUS: <span className="text-[#68D7A5] font-semibold">OPERATIONAL</span></span>
                </div>

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onEnterCommandCenter();
                  }}
                  className="w-full h-11 rounded-xl bg-[#63D8E6] text-[#05070B] font-semibold text-xs font-sans flex items-center justify-center space-x-2 shadow-lg"
                >
                  <span>ENTER COMMAND CENTER</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* CINEMATIC SPLIT HERO */}
      <section className="relative pt-40 pb-28 bg-soft-grid overflow-hidden">
        {/* Subtle Background Technical Coordinates */}
        <div className="absolute top-28 left-10 text-[10px] font-mono text-[#5E697A]/40 pointer-events-none z-0">
          GRID // 34°03'08"N 118°14'34"W // OPTICAL SPECTRUM 8-14μm
        </div>
        <div className="absolute bottom-10 right-10 text-[10px] font-mono text-[#5E697A]/40 pointer-events-none z-0">
          INFRARED INFERENCE ENGINE // SENSOR LINK OK
        </div>

        {/* Ambient Cyan & Violet Glow Breathing Layers */}
        <div className="absolute top-0 right-1/4 w-[600px] h-[450px] ambient-glow-cyan pointer-events-none opacity-50" />
        <div className="absolute top-20 left-10 w-[500px] h-[400px] ambient-glow-violet pointer-events-none opacity-30" />

        <div className="max-w-7xl mx-auto px-6 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          {/* Hero Left Split Content */}
          <div className="lg:col-span-6 space-y-8 text-left">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#63D8E6]/10 border border-[#63D8E6]/20 text-[#63D8E6] text-xs font-sans font-medium"
            >
              <span className="w-2 h-2 rounded-full bg-[#63D8E6] animate-subtle-pulse" />
              <span>REAL-TIME THERMAL INTELLIGENCE</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08 }}
              className="space-y-3"
            >
              <h1 className="text-5xl lg:text-6xl font-bold font-sans tracking-tight text-[#F5F7FA] leading-[1.08]">
                SEE BEYOND.<br />
                <span className="text-[#8D98AA] font-normal">
                  UNDERSTAND WHAT'S HAPPENING.
                </span>
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16 }}
              className="text-[#8D98AA] text-base font-sans max-w-lg leading-relaxed"
            >
              AI-powered thermal detection, tracking and threat intelligence in real time across complex optical environments.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.24 }}
              className="flex flex-wrap items-center gap-4 pt-2"
            >
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={onEnterCommandCenter}
                className="px-6.5 py-3.5 rounded-xl bg-[#63D8E6] hover:bg-[#7AE3EF] text-[#05070B] font-sans font-semibold text-xs transition-all shadow-[0_6px_24px_rgba(99,216,230,0.22)] flex items-center space-x-2 cursor-pointer"
              >
                <span>ENTER COMMAND CENTER</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>

              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => scrollToSection('platform')}
                className="px-6 py-3.5 rounded-xl bg-white/[0.035] hover:bg-white/[0.07] border border-white/[0.08] text-[#F5F7FA] font-sans font-medium text-xs transition-all flex items-center space-x-2 cursor-pointer"
              >
                <span>EXPLORE PLATFORM</span>
              </motion.button>
            </motion.div>
          </div>

          {/* Hero Right Simulated Thermal Viewport Window */}
          <div className="lg:col-span-6">
            <HeroThermalViewport />
          </div>
        </div>
      </section>

      {/* REAL-TIME TELEMETRY PREVIEW (5 METRICS) */}
      <motion.section
        id="platform"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="py-16 lg:py-20 bg-[#0B0F16] border-y border-white/[0.07] relative"
      >
        <div className="max-w-7xl mx-auto px-6 space-y-10">
          <div className="text-center space-y-2.5 max-w-2xl mx-auto">
            <div className="inline-flex items-center space-x-2 text-[#63D8E6] text-xs font-sans bg-[#63D8E6]/10 px-3 py-1 rounded-full border border-[#63D8E6]/20 font-medium">
              <Eye className="w-3.5 h-3.5" />
              <span>LIVE TELEMETRY</span>
            </div>
            <h2 className="text-3xl font-bold font-sans tracking-tight text-[#F5F7FA]">REAL-TIME TELEMETRY PREVIEW</h2>
            <p className="text-[#8D98AA] text-sm font-sans leading-relaxed">
              Continuous multi-target tracking and threat evaluation computed across live frame buffers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'ACTIVE TRACKS', val: 24, sub: '+4.2% this hour', color: 'text-[#63D8E6]' },
              { label: 'THREATS DETECTED', val: 3, sub: '2 high / 1 medium', color: 'text-[#E97D87]' },
              { label: 'STREAM FPS', val: 29.8, sub: 'Target 30 FPS', color: 'text-[#63D8E6]', decimals: 1 },
              { label: 'AI CONFIDENCE', val: 96.7, sub: 'Model optimal', color: 'text-[#68D7A5]', suffix: '%', decimals: 1 },
              { label: 'SENSORS ONLINE', val: 4, sub: 'Thermal array', color: 'text-[#63D8E6]' },
            ].map((metric) => (
              <motion.div
                key={metric.label}
                variants={cardVariants}
                className="p-5.5 rounded-2xl bg-[#05070B] border border-white/[0.07] shadow-lg transition-all duration-200 ease-out hover:bg-[#0E141E] hover:border-[#63D8E6]/30 hover:-translate-y-0.5 space-y-2 group"
              >
                <div className="text-[#8D98AA] text-[11px] font-mono flex items-center justify-between">
                  <span>{metric.label}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20 group-hover:bg-[#63D8E6] transition-colors" />
                </div>
                <div className={`text-3xl font-bold font-mono ${metric.color}`}>
                  <AnimatedNumber value={metric.val} decimals={metric.decimals} />{metric.suffix}
                </div>
                <div className="text-[11px] text-[#5E697A] font-sans">{metric.sub}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* CAPABILITIES SECTION */}
      <motion.section
        id="capabilities"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="py-18 lg:py-22 bg-[#05070B]"
      >
        <div className="max-w-7xl mx-auto px-6 space-y-10 lg:space-y-12">
          <div className="text-center space-y-2.5 max-w-2xl mx-auto">
            <div className="inline-flex items-center space-x-2 text-[#8C9BFF] text-xs font-sans bg-[#8C9BFF]/10 px-3 py-1 rounded-full border border-[#8C9BFF]/20 font-medium">
              <Zap className="w-3.5 h-3.5" />
              <span>CORE CAPABILITIES</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold font-sans tracking-tight text-[#F5F7FA]">ENGINEERED FOR THERMAL ACCURACY</h2>
            <p className="text-[#8D98AA] text-sm font-sans leading-relaxed">
              High-precision threat evaluation and uninterrupted multi-target tracking loops.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
            {[
              {
                num: '01',
                title: 'THERMAL DETECTION',
                desc: 'Real-time object detection powered by customized YOLO models tuned for thermal imaging spectrums.',
                icon: <Camera className="w-5 h-5 text-[#63D8E6]" />,
                isFeatured: false,
              },
              {
                num: '02',
                title: 'MULTI-OBJECT TRACKING',
                desc: 'Simultaneous tracking of multiple targets using ByteTrack / BoT-SORT algorithms with bounding box matching.',
                icon: <Crosshair className="w-5 h-5 text-[#8C9BFF]" />,
                isFeatured: true,
              },
              {
                num: '03',
                title: 'THREAT INTELLIGENCE',
                desc: 'Automated evaluation engine identifying restricted-zone intrusion, unauthorized movement, and overspeed.',
                icon: <ShieldAlert className="w-5 h-5 text-[#E97D87]" />,
                isFeatured: false,
              },
              {
                num: '04',
                title: 'REAL-TIME ANALYTICS',
                desc: 'Transforms surveillance video streams into actionable telemetry graphs, audit trails, and velocity metrics.',
                icon: <LineChart className="w-5 h-5 text-[#E6B866]" />,
                isFeatured: false,
              },
            ].map((card) => (
              <motion.div
                key={card.num}
                variants={cardVariants}
                className={`h-full flex flex-col justify-between p-6 rounded-2xl border transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${
                  card.isFeatured
                    ? 'bg-gradient-to-b from-[#0B0F16] via-[#0D131F] to-[#101726] border-[#8C9BFF]/35 hover:border-[#8C9BFF]/55 relative overflow-hidden'
                    : 'bg-[#0B0F16] border-white/[0.07] hover:bg-[#0E141E] hover:border-white/20 shadow-lg'
                }`}
              >
                {card.isFeatured && (
                  <div className="absolute top-0 right-0 px-2.5 py-0.5 bg-[#8C9BFF]/15 border-l border-b border-[#8C9BFF]/25 text-[10px] font-mono font-medium text-[#8C9BFF] rounded-bl-lg">
                    FEATURED ENGINE
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-[#5E697A] font-medium">{card.num}</span>
                  <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                    {card.icon}
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-semibold font-mono tracking-tight text-[#F5F7FA]">{card.title}</h3>
                  <p className="text-xs text-[#8D98AA] font-sans leading-relaxed mt-2">{card.desc}</p>
                </div>

                <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between text-[11px] font-mono text-[#5E697A]">
                  <span>LATENCY</span>
                  <span className="text-[#68D7A5]">REAL-TIME</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* SYSTEM ARCHITECTURE PIPELINE WITH DATA FLOW */}
      <motion.section
        id="pipeline"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="py-18 lg:py-22 bg-[#0B0F16] border-y border-white/[0.07] relative"
      >
        <div className="max-w-7xl mx-auto px-6 space-y-10 lg:space-y-12">
          <div className="text-center space-y-2.5 max-w-2xl mx-auto">
            <div className="inline-flex items-center space-x-2 text-[#8C9BFF] text-xs font-sans bg-[#8C9BFF]/10 px-3 py-1 rounded-full border border-[#8C9BFF]/20 font-medium">
              <Layers className="w-3.5 h-3.5" />
              <span>SYSTEM ARCHITECTURE</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold font-sans tracking-tight text-[#F5F7FA]">INTELLIGENT PROCESSING PIPELINE</h2>
            <p className="text-[#8D98AA] text-sm font-sans leading-relaxed max-w-2xl mx-auto">
              End-to-end data pipeline: Sensor → Normalization → Deep Learning → Tracking → Threat Engine → Database → Command Center
            </p>
          </div>

          {/* Connected Pipeline Steps with Traveling Data Packet */}
          <div className="relative">
            {/* Desktop Horizontal Line */}
            <div className="hidden xl:block absolute top-1/2 left-6 right-6 h-[1px] bg-white/[0.08] -translate-y-1/2 z-0">
              <motion.div
                className="h-full bg-[#63D8E6]/60 shadow-[0_0_8px_rgba(99,216,230,0.4)]"
                style={{
                  width: '14%',
                  marginLeft: `${(activePipelineStep * 14.28)}%`,
                }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-7 gap-3 relative z-10">
              {[
                { num: '01', title: 'THERMAL SENSOR', sub: 'Integration Option', icon: <Camera className="w-4 h-4 text-[#63D8E6]" /> },
                { num: '02', title: 'FRAME PROCESSING', sub: 'Normalization', icon: <SlidersHorizontal className="w-4 h-4 text-[#63D8E6]" /> },
                { num: '03', title: 'YOLO MODEL', sub: 'Inference Loop', icon: <Cpu className="w-4 h-4 text-[#8C9BFF]" /> },
                { num: '04', title: 'BYTE TRACK', sub: 'IoU Association', icon: <Crosshair className="w-4 h-4 text-[#8C9BFF]" /> },
                { num: '05', title: 'THREAT ENGINE', sub: 'Rule Evaluation', icon: <ShieldAlert className="w-4 h-4 text-[#E97D87]" /> },
                { num: '06', title: 'TELEMETRY DB', sub: 'Persistence Layer', icon: <Database className="w-4 h-4 text-[#E6B866]" /> },
                { num: '07', title: 'COMMAND CENTER', sub: 'WebSocket HUD', icon: <BellRing className="w-4 h-4 text-[#68D7A5]" /> },
              ].map((step, idx) => {
                const isActive = activePipelineStep === idx;
                return (
                  <motion.div
                    key={step.num}
                    variants={cardVariants}
                    className={`p-4 rounded-2xl border transition-all duration-200 ease-out space-y-3 text-left ${
                      isActive
                        ? 'bg-[#101724] border-[#63D8E6]/40 shadow-lg shadow-black/40'
                        : 'bg-[#05070B] border-white/[0.07] hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-medium ${isActive ? 'text-[#63D8E6]' : 'text-[#5E697A]'}`}>
                        STEP {step.num}
                      </span>
                      <div className="p-1.5 rounded-lg bg-white/[0.04]">
                        {step.icon}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[11px] font-semibold font-mono text-[#F5F7FA] truncate">{step.title}</h4>
                      <p className="text-[10px] font-sans text-[#8D98AA] mt-0.5">{step.sub}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.section>

      {/* TECHNICAL SPECIFICATION WALL */}
      <motion.section
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="py-16 lg:py-18 bg-[#05070B]"
      >
        <div className="max-w-7xl mx-auto px-6 space-y-10">
          <div className="text-center space-y-2.5 max-w-2xl mx-auto">
            <div className="inline-flex items-center space-x-2 text-[#8C9BFF] text-xs font-sans bg-[#8C9BFF]/10 px-3 py-1 rounded-full border border-[#8C9BFF]/20 font-medium">
              <Code className="w-3.5 h-3.5" />
              <span>TECHNOLOGY SPECIFICATIONS</span>
            </div>
            <h2 className="text-3xl font-bold font-sans tracking-tight text-[#F5F7FA]">BUILT WITH PROVEN ENGINEERING</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { title: 'FastAPI backend', purpose: 'Python async high-concurrency API server with native WebSocket broadcast', icon: <Server className="w-5 h-5 text-[#8C9BFF]" /> },
              { title: 'YOLO deep learning', purpose: 'Custom trained thermal optical object detection model (YOLO11n)', icon: <Cpu className="w-5 h-5 text-[#63D8E6]" /> },
              { title: 'ByteTrack Tracker', purpose: 'Multi-object IoU association & trajectory motion tracking engine', icon: <Crosshair className="w-5 h-5 text-[#8C9BFF]" /> },
              { title: 'React + Vite', purpose: 'High-performance UI with HMR state synchronization', icon: <Layout className="w-5 h-5 text-[#63D8E6]" /> },
              { title: 'Tailwind CSS', purpose: 'Dark intelligence design tokens & GPU-accelerated canvas styling', icon: <Camera className="w-5 h-5 text-[#8C9BFF]" /> },
              { title: 'SQLite database', purpose: 'Persistence layer for alert logs, zone coordinates, and system audit history', icon: <Database className="w-5 h-5 text-[#68D7A5]" /> },
            ].map((tech) => (
              <motion.div
                key={tech.title}
                variants={cardVariants}
                className="p-5.5 rounded-2xl bg-[#0B0F16] border border-white/[0.07] hover:border-white/20 hover:bg-[#0E141E] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all duration-200 ease-out flex items-start space-x-4"
              >
                <div className="w-10 h-10 rounded-xl bg-white/[0.035] border border-white/[0.06] flex items-center justify-center shrink-0">
                  {tech.icon}
                </div>
                <div>
                  <h4 className="text-sm font-semibold font-mono text-[#F5F7FA]">{tech.title}</h4>
                  <p className="text-xs text-[#8D98AA] font-sans mt-1 leading-relaxed">{tech.purpose}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* SURVEILLANCE DEPLOYMENT SECTORS */}
      <motion.section
        id="surveillance"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="py-18 lg:py-22 bg-[#0B0F16] border-t border-white/[0.07]"
      >
        <div className="max-w-7xl mx-auto px-6 space-y-10 lg:space-y-12">
          <div className="text-center space-y-2.5 max-w-2xl mx-auto">
            <div className="inline-flex items-center space-x-2 text-[#63D8E6] text-xs font-sans bg-[#63D8E6]/10 px-3 py-1 rounded-full border border-[#63D8E6]/20 font-medium">
              <Target className="w-3.5 h-3.5" />
              <span>MISSION SECTORS</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold font-sans tracking-tight text-[#F5F7FA]">SURVEILLANCE DEPLOYMENT SECTORS</h2>
            <p className="text-[#8D98AA] text-sm font-sans leading-relaxed max-w-xl mx-auto">
              Configurable operational threat parameters tailored to diverse deployment perimeters.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
            {[
              'BORDER SURVEILLANCE',
              'CRITICAL INFRASTRUCTURE',
              'PERIMETER SECURITY',
              'NIGHT MONITORING',
              'INDUSTRIAL SECURITY',
              'TACTICAL SURVEILLANCE',
            ].map((usecase) => (
              <motion.div
                key={usecase}
                variants={cardVariants}
                className="p-5 rounded-2xl bg-[#05070B] border border-white/[0.07] hover:border-[#63D8E6]/30 hover:bg-[#0E141E] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all duration-200 ease-out flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-9 h-9 rounded-xl bg-[#63D8E6]/[0.08] border border-[#63D8E6]/20 flex items-center justify-center text-[#63D8E6] shrink-0 group-hover:bg-[#63D8E6]/15 group-hover:border-[#63D8E6]/35 transition-colors">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold font-mono tracking-wide text-[#F5F7FA]">{usecase}</h4>
                    <p className="text-[11px] text-[#8D98AA] font-sans mt-0.5">Thermal intelligence active</p>
                  </div>
                </div>

                <ArrowRight className="w-4 h-4 text-[#5E697A] group-hover:text-[#63D8E6] group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* FINAL COMMAND CENTER CTA */}
      <motion.section
        id="analytics"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="py-20 lg:py-24 bg-[#05070B] relative text-center"
      >
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            variants={cardVariants}
            className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#0B0F16] via-[#05070B] to-[#0B0F16] p-10 lg:p-16 shadow-2xl relative overflow-hidden space-y-7"
          >
            {/* Ambient Background Radial Light */}
            <div className="absolute inset-0 ambient-glow-violet pointer-events-none opacity-40" />

            <div className="space-y-3.5 relative z-10 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-sans text-[#F5F7FA] tracking-tight leading-tight">
                TURN SURVEILLANCE<br />
                <span className="text-[#8C9BFF]">INTO INTELLIGENCE.</span>
              </h2>
              <p className="text-sm font-sans text-[#8D98AA] tracking-wide">
                Monitor. Detect. Track. Respond.
              </p>
            </div>

            <div className="relative z-10 pt-1">
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={onEnterCommandCenter}
                className="h-12 px-8 rounded-xl bg-[#63D8E6] hover:bg-[#7AE3EF] text-[#05070B] font-sans font-semibold text-xs tracking-wider shadow-[0_4px_20px_rgba(99,216,230,0.22)] inline-flex items-center space-x-2 cursor-pointer transition-all duration-200"
              >
                <span>OPEN COMMAND CENTER</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* FOOTER */}
      <footer className="py-10 bg-[#040508] border-t border-white/[0.07] text-xs font-sans text-[#8D98AA]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center md:text-left">
            <div className="font-semibold text-[#F5F7FA]">AI-MULTISENSE v1.0</div>
            <div className="text-[11px] text-[#5E697A]">Real-time thermal deep learning surveillance platform</div>
          </div>

          <div className="flex items-center space-x-2 text-[#68D7A5] font-medium bg-[#68D7A5]/[0.07] px-3.5 py-1 rounded-full border border-[#68D7A5]/20">
            <span className="w-2 h-2 rounded-full bg-[#68D7A5]" />
            <span>SYSTEM STATUS: OPERATIONAL</span>
          </div>

          <div className="text-[11px] text-[#5E697A]">
            Major College Project • Faculty Evaluation Link Ready
          </div>
        </div>
      </footer>
    </div>
  );
};


