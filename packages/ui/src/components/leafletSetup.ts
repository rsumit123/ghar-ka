import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import icon2x from 'leaflet/dist/images/marker-icon-2x.png';
import icon from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';

// Vite hashes asset URLs, which breaks Leaflet's default icon path detection; point it at the bundled files.
// imagePath '' stops Leaflet prefixing its detected folder onto these already-complete URLs (it showed a broken marker).
L.Icon.Default.imagePath = '';
L.Icon.Default.mergeOptions({ iconRetinaUrl: icon2x, iconUrl: icon, shadowUrl: shadow });

export { L };
