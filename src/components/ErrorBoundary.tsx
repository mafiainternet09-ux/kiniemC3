import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Đã xảy ra lỗi không mong muốn.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="archival-paper-bg flex min-h-screen items-center justify-center p-6 text-[#1C1917]">
          <div className="editorial-card-shadow max-w-lg rounded-2xl border border-[#E5DDD0] bg-white p-8">
            <p className="text-[11px] font-semibold tracking-wider text-[#C83E31] uppercase">
              Thông báo hệ thống
            </p>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-[#1C1917]">
              Không thể hiển thị nội dung này
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#57534E]">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 cursor-pointer rounded-md bg-[#1C1917] px-6 py-2.5 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#C83E31]"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
