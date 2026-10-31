import React, { useState } from 'react';
import { 
  X, 
  Coins, 
  Crown, 
  Check, 
  Sparkles, 
  Zap, 
  CreditCard, 
  ArrowUpRight,
  ShieldCheck,
  Clock
} from 'lucide-react';
import type { Language, CoinPackage, UserProfile } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  user: UserProfile;
  onAddCoins: (amount: number) => void;
}

const COIN_PACKAGES: CoinPackage[] = [
  { id: 'pack-1', coins: 500, price: '$4.99', popular: false },
  { id: 'pack-2', coins: 1250, price: '$9.99', bonus: 150, popular: true },
  { id: 'pack-3', coins: 3000, price: '$19.99', bonus: 500, bestValue: true },
];

export const AfgWalletModal: React.FC<AfgWalletModalProps> = ({
  isOpen,
  onClose,
  language,
  user,
  onAddCoins,
}) => {
  if (!isOpen) return null;

  const t = translations[language];
  const [purchasedId, setPurchasedId] = useState<string | null>(null);

  const handlePurchase = (pack: CoinPackage) => {
    setPurchasedId(pack.id);
    const total = pack.coins + (pack.bonus || 0);
    onAddCoins(total);
    setTimeout(() => {
      setPurchasedId(null);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-3xl bg-[#09122c] border border-amber-500/40 p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(245,158,11,0.2)] max-h-[90vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-3 shadow-[0_0_20px_rgba(245,158,11,0.4)]">
            <span className="text-3xl">🪙</span>
          </div>
          <h2 className="text-2xl font-black text-white">
            {t.walletTitle}
          </h2>
          <p className="text-xs sm:text-sm text-amber-300/80 mt-1">
            {t.currentBalance} <strong className="text-amber-300 text-lg">{user.coins.toLocaleString()} {t.coins}</strong>
          </p>
        </div>

        {/* VIP Pro++ Banner */}
        <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-r from-amber-600/30 via-yellow-600/20 to-amber-700/30 border border-amber-500/50 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center font-bold">
              <Crown className="w-6 h-6 fill-current" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-200">
                {t.vipBannerTitle}
              </h3>
              <p className="text-[11px] text-amber-100/70">
                {t.vipBannerDesc}
              </p>
            </div>
          </div>
        </div>

        {/* Coin Packages Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {COIN_PACKAGES.map((pack) => {
            const isSuccess = purchasedId === pack.id;
            return (
              <div
                key={pack.id}
                className={`relative rounded-2xl p-4 flex flex-col justify-between transition-all ${
                  pack.popular
                    ? 'bg-gradient-to-b from-amber-950/60 to-[#0c183a] border-2 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)] scale-102'
                    : 'bg-slate-900/80 border border-slate-700/60 hover:border-amber-500/40'
                }`}
              >
                {pack.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-950 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow">
                    {t.popularBadge}
                  </span>
                )}
                {pack.bestValue && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow">
                    {t.bestValueBadge}
                  </span>
                )}

                <div className="text-center pt-1 mb-3">
                  <span className="text-2xl font-black text-amber-300 block">
                    {pack.coins.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {t.coins}
                  </span>
                  {pack.bonus && (
                    <span className="block mt-1 text-[10px] font-bold text-emerald-400">
                      +{pack.bonus} {language === 'dari' ? 'هدیه' : 'Bonus'}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handlePurchase(pack)}
                  className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${
                    isSuccess
                      ? 'bg-emerald-500 text-slate-950'
                      : pack.popular
                      ? 'gradient-btn-gold text-amber-950 hover:brightness-110'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                  }`}
                >
                  {isSuccess ? (
                    <span className="flex items-center justify-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      {language === 'dari' ? 'شارژ شد!' : 'Added!'}
                    </span>
                  ) : (
                    pack.price
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Trust Badges */}
        <div className="pt-3 border-t border-cyan-900/40 flex items-center justify-around text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            100% Safe Payment
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            Instant Activation
          </span>
        </div>

      </div>
    </div>
  );
};
