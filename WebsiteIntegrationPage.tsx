import React, { useState, useEffect, useRef } from 'react';
import { StaffLayout, StaffTab } from '../components/StaffLayout';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurant } from '../services/restaurants';
import { Restaurant } from '../lib/types';
import {
  Globe,
  Copy,
  Check,
  ExternalLink,
  Code,
  Monitor,
  Smartphone,
  Eye,
  EyeOff,
  Loader2,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface WebsiteIntegrationPageProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

export function WebsiteIntegrationPage({ activeTab, onNavigate, onLogout }: WebsiteIntegrationPageProps) {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showPreview, setShowPreview] = useState(false);
  const [codeExpanded, setCodeExpanded] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(700);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!user?.restaurant_id) return;
    getRestaurant(user.restaurant_id)
      .then((r) => setRestaurant(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.restaurant_id]);

  // Listen for height messages from the preview iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data && e.data.type === 'rezerved-embed-resize' && typeof e.data.height === 'number') {
        setIframeHeight(e.data.height);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const baseUrl = window.location.origin;
  const embedUrl = restaurant?.slug ? `${baseUrl}/embed/${restaurant.slug}` : '';

  const iframeSnippet = embedUrl
    ? `<!-- Rezerved Booking Widget -->
<div id="rezerved-booking-widget-container">
  <iframe
    id="rezerved-booking-widget"
    src="${embedUrl}"
    width="100%"
    height="700"
    style="border:0; width:100%; max-width:100%; overflow:hidden;"
    title="Book a Table"
    loading="lazy">
  </iframe>
</div>
<script>
  window.addEventListener("message", function(event) {
    if (event.data && event.data.type === "rezerved-embed-resize") {
      var iframe = document.getElementById("rezerved-booking-widget");
      if (iframe && event.data.height) {
        iframe.style.height = event.data.height + "px";
      }
    }
  });
</script>`
    : '';

  const handleCopy = async () => {
    if (!iframeSnippet) return;
    try {
      await navigator.clipboard.writeText(iframeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = iframeSnippet;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center ring-1 ring-blue-500/20">
              <Globe className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Website Booking Widget</h1>
              <p className="text-sm text-slate-400">Let customers book directly from your website</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : !restaurant?.slug ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
            <Info className="w-8 h-8 text-amber-400/80 mx-auto mb-3" />
            <p className="text-slate-200 font-medium">Widget URL not configured</p>
            <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
              Your restaurant needs a URL slug to enable the booking widget. Contact support to set this up.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Quick Copy Section */}
            <section className="bg-gradient-to-r from-slate-800/80 to-slate-800/50 border border-slate-700/80 rounded-xl p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-white mb-1">Add Rezerved to your website</h2>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                    Paste this code into your restaurant website to let customers book through Rezerved without leaving your site.
                  </p>
                </div>
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-2 px-5 h-11 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                    copied
                      ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                      : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied to clipboard!' : 'Copy Website Booking Code'}
                </button>
              </div>
            </section>

            {/* Embed URL */}
            <section className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">Widget URL</h3>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-900/80 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-slate-200 font-mono truncate">
                  {embedUrl}
                </div>
                <a
                  href={embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-colors flex-shrink-0"
                  title="Open widget in new tab"
                >
                  <ExternalLink className="w-4 h-4 text-slate-300" />
                </a>
              </div>
            </section>

            {/* Code Snippet (collapsible) */}
            <section className="bg-slate-800/40 border border-slate-700/60 rounded-xl overflow-hidden">
              <button
                onClick={() => setCodeExpanded(!codeExpanded)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Code className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-white">Embed Code</span>
                  <span className="text-[10px] text-slate-500">HTML + JavaScript</span>
                </div>
                {codeExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>
              {codeExpanded && (
                <div className="px-5 pb-5 border-t border-slate-700/40">
                  <div className="flex items-center justify-between mt-4 mb-3">
                    <p className="text-xs text-slate-400">
                      Place this inside your page's {'<body>'} where you want the booking widget.
                    </p>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-colors"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="bg-[#0a0f1a] border border-slate-700/40 rounded-lg p-4 overflow-x-auto max-h-[240px] overflow-y-auto">
                    <pre className="text-[11px] text-slate-300 font-mono whitespace-pre leading-[1.7]">
                      {iframeSnippet}
                    </pre>
                  </div>
                </div>
              )}
            </section>

            {/* Preview */}
            <section className="bg-slate-800/40 border border-slate-700/60 rounded-xl overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-slate-700/40">
                <div className="flex items-center gap-2.5">
                  <Eye className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-white">Live Preview</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-900/60 rounded-lg p-0.5 ring-1 ring-white/[0.06]">
                    <button
                      onClick={() => setPreviewDevice('desktop')}
                      className={`p-2 rounded-md transition-all ${
                        previewDevice === 'desktop' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-300'
                      }`}
                      title="Desktop preview"
                    >
                      <Monitor className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPreviewDevice('mobile')}
                      className={`p-2 rounded-md transition-all ${
                        previewDevice === 'mobile' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-300'
                      }`}
                      title="Mobile preview"
                    >
                      <Smartphone className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={`flex items-center gap-1.5 px-3 h-8 text-xs rounded-lg transition-all ${
                      showPreview
                        ? 'bg-slate-700 text-white ring-1 ring-white/10'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPreview ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {showPreview && (
                <div className="p-4 sm:p-6 bg-slate-900/40">
                  <div className="flex justify-center">
                    <div
                      className={`rounded-xl overflow-hidden ring-1 ring-white/[0.06] transition-all duration-300 ${
                        previewDevice === 'mobile' ? 'w-[390px]' : 'w-full max-w-[860px]'
                      }`}
                      style={{ background: '#070b14' }}
                    >
                      <iframe
                        ref={iframeRef}
                        src={embedUrl}
                        title="Widget Preview"
                        className="w-full border-0"
                        style={{ height: `${iframeHeight}px`, transition: 'height 0.2s ease' }}
                      />
                    </div>
                  </div>
                  {previewDevice === 'mobile' && (
                    <p className="text-[10px] text-slate-500 text-center mt-3">iPhone 14 Pro viewport (390px)</p>
                  )}
                </div>
              )}
            </section>

            {/* How it works */}
            <section className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">How it works</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { step: '1', title: 'Copy the code', desc: 'Click the button above to copy the embed snippet to your clipboard.' },
                  { step: '2', title: 'Paste into your site', desc: 'Add it to any page on your website using your CMS or HTML editor.' },
                  { step: '3', title: 'Accept bookings', desc: 'Customers book directly on your site. You manage them here in Rezerved.' },
                ].map((item) => (
                  <div key={item.step} className="p-4 bg-slate-900/40 rounded-xl ring-1 ring-white/[0.04]">
                    <div className="w-7 h-7 rounded-full bg-blue-500/15 ring-1 ring-blue-500/20 flex items-center justify-center mb-3">
                      <span className="text-xs font-bold text-blue-400">{item.step}</span>
                    </div>
                    <p className="text-sm text-white font-medium mb-1">{item.title}</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Features */}
            <section className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Widget features</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { label: 'Responsive design', desc: 'Adapts to any screen size' },
                  { label: 'Auto-resizing', desc: 'No scrollbars - adjusts height dynamically' },
                  { label: 'Interactive table map', desc: 'Customers pick their preferred table' },
                  { label: 'Real-time availability', desc: 'Always shows live table status' },
                  { label: 'No login required', desc: 'Guests book without creating accounts' },
                  { label: 'Instant confirmation', desc: 'Email sent automatically on booking' },
                ].map((f) => (
                  <div key={f.label} className="flex items-start gap-2.5 p-3 bg-slate-900/30 rounded-lg ring-1 ring-white/[0.03]">
                    <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-white font-medium">{f.label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </StaffLayout>
  );
}
