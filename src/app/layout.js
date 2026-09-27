import { Anton, Spinnaker } from "next/font/google";
import { AuthProvider } from "../components/AuthProvider";
import ProfileSetupDialog from "../components/ProfileSetupDialog";
import "./globals.css";

// Fit4 The Future brand fonts (as on f4tf.co.uk): Anton for headings,
// Spinnaker for body text.
const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

const spinnaker = Spinnaker({
  variable: "--font-spinnaker",
  weight: "400",
  subsets: ["latin"],
});

export const metadata = {
  title: "F4TF Fitness Tracker",
  description: "Gym programs, workouts and progress tracking",
  appleWebApp: {
    capable: true,
    title: "F4TF",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${anton.variable} ${spinnaker.variable}`}>
      <body>
        <AuthProvider>
          {children}
          <ProfileSetupDialog />
        </AuthProvider>
      </body>
    </html>
  );
}
