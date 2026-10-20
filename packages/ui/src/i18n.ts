/** Bilingual dictionary. Add keys here; use `t('key')` for {en, hi} or `<Bi k="key" />` to render both. */
export type Bilingual = { en: string; hi: string };

const dict = {
  phone: { en: 'Mobile number', hi: 'मोबाइल नंबर' },
  sendCode: { en: 'Send code', hi: 'कोड भेजें' },
  enterCode: { en: 'Enter the 6-digit code', hi: '6 अंकों का कोड डालें' },
  codeSentTo: { en: 'We sent a code to', hi: 'कोड भेजा गया' },
  verify: { en: 'Verify', hi: 'सत्यापित करें' },
  resend: { en: 'Send again', hi: 'फिर से भेजें' },
  changeNumber: { en: 'Change number', hi: 'नंबर बदलें' },
  login: { en: 'Log in', hi: 'लॉग इन' },
  logout: { en: 'Log out', hi: 'लॉग आउट' },
  email: { en: 'Email', hi: 'ईमेल' },
  password: { en: 'Password', hi: 'पासवर्ड' },
  welcome: { en: 'Welcome', hi: 'स्वागत है' },
  loading: { en: 'Loading…', hi: 'लोड हो रहा है…' },
  retry: { en: 'Try again', hi: 'फिर कोशिश करें' },
  home: { en: 'Home', hi: 'होम' },
  orders: { en: 'Orders', hi: 'ऑर्डर' },
  todayOrders: { en: "Today's orders", hi: 'आज के ऑर्डर' },
  menu: { en: 'Menu', hi: 'मेनू' },
  plans: { en: 'Tiffin plans', hi: 'टिफिन प्लान' },
  delivery: { en: 'Delivery', hi: 'डिलीवरी' },
  profile: { en: 'Profile', hi: 'प्रोफ़ाइल' },
  accept: { en: 'Accept', hi: 'स्वीकार करें' },
  ready: { en: 'Ready', hi: 'तैयार है' },
  done: { en: 'Done', hi: 'हो गया' },
  cancel: { en: 'Cancel', hi: 'रद्द करें' },
  save: { en: 'Save', hi: 'सहेजें' },
  back: { en: 'Back', hi: 'वापस' },
  next: { en: 'Next', hi: 'आगे' },
  useMyLocation: { en: 'Use my location', hi: 'मेरी लोकेशन लगाएँ' },
  searchPlace: { en: 'Search a place', hi: 'जगह खोजें' },
  dragPin: { en: 'Drag the pin to adjust', hi: 'पिन को खींचकर ठीक करें' },
  emptyNothingYet: { en: 'Nothing here yet', hi: 'अभी कुछ नहीं है' },
  notAllowed: { en: "You don't have access to this page", hi: 'आपको इस पेज की अनुमति नहीं है' },
  adminLogin: { en: 'Admin login', hi: 'एडमिन लॉगिन' },
  vendorLoginTitle: { en: 'Cook login', hi: 'रसोइया लॉगिन' },
  customerLoginTitle: { en: 'Log in to order', hi: 'ऑर्डर के लिए लॉग इन करें' },
} satisfies Record<string, Bilingual>;

export type DictKey = keyof typeof dict;

export const t = (key: DictKey): Bilingual => dict[key];
