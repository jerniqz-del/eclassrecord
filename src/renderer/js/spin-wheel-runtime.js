import { Wheel } from '../vendor/spin-wheel/wheel.js';

window.SpinWheel = Wheel;
window.dispatchEvent(new CustomEvent('spin-wheel-ready'));
