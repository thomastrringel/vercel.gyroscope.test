/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Smartphone, Compass, RotateCcw, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';

interface GyroData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}

export default function App() {
  const [gyroData, setGyroData] = useState<GyroData>({ alpha: 0, beta: 0, gamma: 0 });
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'default' | 'granted' | 'denied'>('default');
  const [error, setError] = useState<string | null>(null);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    setGyroData({
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
    });
  }, []);

  useEffect(() => {
    // Basic check for API existence
    if (!window.DeviceOrientationEvent) {
      setIsSupported(false);
      setError("DeviceOrientationEvent is not supported by this browser.");
      return;
    }

    // On some browsers, we might need to wait for the first event to confirm hardware support
    // but usually existence of the API is a good sign.
    setIsSupported(true);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [handleOrientation]);

  const requestPermission = async () => {
    // Check if requestPermission exists (iOS 13+)
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          setPermissionStatus('granted');
          window.addEventListener('deviceorientation', handleOrientation);
        } else {
          setPermissionStatus('denied');
          setError("Permission to access gyroscope was denied.");
        }
      } catch (err) {
        setError("Error requesting gyroscope permission.");
        console.error(err);
      }
    } else {
      // For non-iOS or older versions, just add the listener
      setPermissionStatus('granted');
      window.addEventListener('deviceorientation', handleOrientation);
    }
  };

  const formatValue = (val: number | null) => (val !== null ? val.toFixed(2) : 'N/A');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      <div className="max-w-md mx-auto px-6 py-12 flex flex-col min-h-screen">
        {/* Header */}
        <header className="mb-12 text-center">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex p-3 bg-indigo-600 rounded-2xl mb-4 shadow-lg shadow-indigo-200"
          >
            <Smartphone className="text-white w-8 h-8" />
          </motion.div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Gyroscope Explorer</h1>
          <p className="text-slate-500">Real-time motion sensor data</p>
        </header>

        <main className="flex-grow flex flex-col gap-6">
          {/* Status Card */}
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">System Status</h2>
              {isSupported === true ? (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  <CheckCircle2 size={14} /> Supported
                </span>
              ) : isSupported === false ? (
                <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">
                  <AlertCircle size={14} /> Not Supported
                </span>
              ) : (
                <span className="text-xs font-medium text-slate-400">Checking...</span>
              )}
            </div>

            {permissionStatus !== 'granted' && isSupported && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-4 py-4"
              >
                <div className="p-4 bg-indigo-50 rounded-full text-indigo-600">
                  <ShieldCheck size={48} strokeWidth={1.5} />
                </div>
                <p className="text-center text-slate-600 text-sm px-4">
                  We need your permission to access the motion sensors on your device.
                </p>
                <button
                  onClick={requestPermission}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-indigo-100 active:scale-95"
                >
                  Enable Sensors
                </button>
              </motion.div>
            )}

            {permissionStatus === 'granted' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-slate-700">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-indigo-600">
                    <Compass size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Alpha (Z-axis)</p>
                    <p className="text-xl font-mono font-bold">{formatValue(gyroData.alpha)}°</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-slate-700">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-emerald-600">
                    <RotateCcw size={20} className="rotate-90" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Beta (X-axis)</p>
                    <p className="text-xl font-mono font-bold">{formatValue(gyroData.beta)}°</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-slate-700">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-amber-600">
                    <RotateCcw size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Gamma (Y-axis)</p>
                    <p className="text-xl font-mono font-bold">{formatValue(gyroData.gamma)}°</p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Visualizer */}
          <AnimatePresence>
            {permissionStatus === 'granted' && (
              <motion.section 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center overflow-hidden relative"
              >
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                     style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                
                <div className="relative w-48 h-48 flex items-center justify-center">
                  {/* Outer Ring */}
                  <div className="absolute inset-0 border-2 border-slate-100 rounded-full"></div>
                  
                  {/* Dynamic Ball */}
                  <motion.div
                    animate={{
                      x: (gyroData.gamma || 0) * 1.5,
                      y: (gyroData.beta || 0) * 1.5,
                      rotateZ: gyroData.alpha || 0,
                    }}
                    transition={{ type: 'spring', damping: 15, stiffness: 100 }}
                    className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl shadow-xl shadow-indigo-200 flex items-center justify-center"
                  >
                    <div className="w-2 h-2 bg-white/30 rounded-full absolute top-3 left-3"></div>
                  </motion.div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {error && (
            <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-start gap-3 text-red-700">
              <AlertCircle className="shrink-0 mt-0.5" size={18} />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </main>

        <footer className="mt-auto pt-12 text-center">
          <p className="text-xs text-slate-400">
            Note: This app works best on physical mobile devices.
          </p>
        </footer>
      </div>
    </div>
  );
}
