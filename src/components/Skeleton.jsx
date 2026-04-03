import React from 'react';
import { motion } from 'framer-motion';

const shimmerConfig = {
  animate: { backgroundPosition: ['200% 0', '-200% 0'] },
  transition: { duration: 2.5, repeat: Infinity, ease: 'linear' },
  className: "bg-paper-200/50 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] bg-[length:200%_100%]"
};

export function SkeletonRow({ className = "h-4 w-full rounded-md" }) {
  return (
    <motion.div
      {...shimmerConfig}
      className={`${shimmerConfig.className} ${className}`}
    />
  );
}

export function SkeletonCard({ className = "p-5 rounded-xl border border-paper-200 bg-paper-50 relative overflow-hidden h-32" }) {
  return (
    <div className={className}>
      {/* Background Shimmer Layer */}
      <motion.div
        {...shimmerConfig}
        className="absolute inset-0 z-0 bg-paper-100 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)] bg-[length:200%_100%] opacity-40"
      />
      {/* Skeleton Content */}
      <div className="relative z-10 flex gap-4 opacity-70">
        <SkeletonRow className="w-12 h-12 rounded-lg bg-paper-200 shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <SkeletonRow className="h-5 w-1/3 rounded-md bg-paper-200" />
          <SkeletonRow className="h-3 w-1/2 rounded-md bg-paper-200" />
          <SkeletonRow className="h-3 w-1/4 rounded-md bg-paper-200 mt-4" />
        </div>
      </div>
    </div>
  );
}
