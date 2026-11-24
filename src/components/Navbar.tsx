import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Leaf, LogIn, LogOut, Menu, Shield, UserCheck, X } from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import type { RouteView, YearCode } from '../types/memory';

interface NavbarProps {
  leavesEnabled?: boolean;
  onToggleLeaves?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  leavesEnabled = true,
  onToggleLeaves,
}) => {
  const {
    route,
    navigate,
    siteConfig,
    user,
    userRole,
    isAdmin,
    signInWithGoogle,
    logout,
  } = useArchive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const isYearActive = (year: YearCode) =>
    route.page === 'year' && route.year === year;

  const handleNav = (next: RouteView) => {
    navigate(next);
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
  };

  const navItems: { label: string; active: boolean; target: RouteView }[] = [
    { label: 'Trang chủ', active: route.page === 'home', target: { page: 'home' } },
    { label: '10A3', active: isYearActive('10A3'), target: { page: 'year', year: '10A3' } },
    { label: '11B3', active: isYearActive('11B3'), target: { page: 'year', year: '11B3' } },
    {
      label: '12C3',
      active: isYearActive('12C3') || route.page === 'yearbook',
      target: { page: 'year', year: '12C3' },
    },
    { label: 'Phòng học 50', active: route.page === 'classroom', target: { page: 'classroom' } },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[#E5DDD0] bg-[#FAF7F2]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-8 px-5 py-3.5 sm:px-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNav({ page: 'home' })}
          className="cursor-pointer font-serif text-xl font-bold tracking-tight text-[#1C1917] whitespace-nowrap shrink-0 transition-colors hover:text-[#C83E31] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C83E31]"
        >
          {siteConfig.siteName}
        </button>

        {/* Zone 2: 5 concise single-line nav links */}
        <nav
          aria-label="Điều hướng chính"
          className="hidden lg:flex items-center gap-8 text-sm font-medium text-[#57534E]"
        >
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNav(item.target)}
              className={`relative cursor-pointer whitespace-nowrap shrink-0 py-1.5 transition-colors hover:text-[#1C1917] ${
                item.active ? 'font-semibold text-[#1C1917]' : ''
              }`}
            >
              <span>{item.label}</span>
              {item.active && (
                <motion.span
                  layoutId="c3-nav-indicator"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-x-0 -bottom-0.5 h-[2px] bg-[#C83E31]"
                />
              )}
            </button>
          ))}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="relative flex items-center gap-3 shrink-0">
          {!user ? (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="hidden sm:inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-[#FAF7F2] transition-colors duration-200 hover:bg-[#C83E31] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C83E31]"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Đăng nhập</span>
            </button>
          ) : (
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                aria-expanded={accountMenuOpen}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#DDD5C7] bg-white px-3.5 py-1.5 text-xs font-medium text-[#1C1917] transition-colors hover:border-[#C83E31] whitespace-nowrap shrink-0"
              >
                <UserCheck className="h-3.5 w-3.5 text-[#C83E31]" aria-hidden="true" />
                <span className="max-w-[140px] truncate">
                  {user.displayName || 'Thành viên'}
                </span>
              </button>

              <AnimatePresence>
                {accountMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="editorial-card-shadow absolute right-0 mt-2 w-64 rounded-xl border border-[#E5DDD0] bg-white p-2"
                  >
                    <div className="border-b border-[#EFEAE0] px-3 py-2 text-xs text-[#57534E]">
                      <p className="truncate font-semibold text-[#1C1917]">
                        {user.displayName}
                      </p>
                      <p className="mt-0.5">
                        Vai trò:{' '}
                        {userRole === 'admin'
                          ? 'Quản trị viên'
                          : userRole === 'member'
                          ? 'Thành viên C3'
                          : 'Đang chờ duyệt'}
                      </p>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleNav({ page: 'admin' })}
                        className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[#1C1917] transition-colors hover:bg-[#FAF7F2]"
                      >
                        <Shield className="h-3.5 w-3.5 text-[#C83E31]" aria-hidden="true" />
                        <span>Trang quản trị C3</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        void logout();
                      }}
                      className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[#B91C1C] transition-colors hover:bg-[#FEF2F2]"
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Đăng xuất</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu điều hướng'}
            aria-expanded={mobileMenuOpen}
            className="inline-flex lg:hidden cursor-pointer items-center justify-center rounded-lg border border-[#DDD5C7] bg-white p-2 text-[#1C1917]"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-[#E5DDD0] bg-[#FAF7F2] px-5 lg:hidden"
          >
            <div className="flex flex-col gap-1 py-4 text-sm font-medium text-[#1C1917]">
              <button
                type="button"
                onClick={() => handleNav({ page: 'home' })}
                className="rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#EFE9DE]"
              >
                Trang chủ
              </button>
              <button
                type="button"
                onClick={() => handleNav({ page: 'year', year: '10A3' })}
                className="rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#EFE9DE]"
              >
                Lớp 10 · 10A3
              </button>
              <button
                type="button"
                onClick={() => handleNav({ page: 'year', year: '11B3' })}
                className="rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#EFE9DE]"
              >
                Lớp 11 · 11B3
              </button>
              <button
                type="button"
                onClick={() => handleNav({ page: 'year', year: '12C3' })}
                className="rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#EFE9DE]"
              >
                Lớp 12 · 12C3
              </button>
              <button
                type="button"
                onClick={() => handleNav({ page: 'yearbook' })}
                className="rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#EFE9DE]"
              >
                Phòng ảnh Kỷ yếu 12C3
              </button>
              <button
                type="button"
                onClick={() => handleNav({ page: 'classroom' })}
                className="rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#EFE9DE]"
              >
                Phòng học 50 thành viên
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleNav({ page: 'admin' })}
                  className="rounded-lg px-3 py-2.5 text-left text-[#C83E31] transition-colors hover:bg-[#EFE9DE]"
                >
                  Trang quản trị C3
                </button>
              )}
              {onToggleLeaves && (
                <button
                  type="button"
                  onClick={onToggleLeaves}
                  aria-pressed={leavesEnabled}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#EFE9DE]"
                >
                  <span className="flex items-center gap-2">
                    <Leaf
                      className={`h-4 w-4 ${leavesEnabled ? 'text-[#C83E31]' : 'text-[#78716C]'}`}
                      aria-hidden="true"
                    />
                    <span>Hiệu ứng lá rơi</span>
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      leavesEnabled ? 'text-[#C83E31]' : 'text-[#78716C]'
                    }`}
                  >
                    {leavesEnabled ? 'Đang bật' : 'Đang tắt'}
                  </span>
                </button>
              )}
              <div className="pt-2">
                {!user ? (
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle()}
                    className="w-full rounded-lg bg-[#1C1917] px-4 py-2.5 text-xs font-semibold text-[#FAF7F2]"
                  >
                    Đăng nhập thành viên
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      void logout();
                    }}
                    className="w-full rounded-lg border border-[#E5C5C2] px-4 py-2.5 text-xs font-medium text-[#B91C1C]"
                  >
                    Đăng xuất ({user.displayName})
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
