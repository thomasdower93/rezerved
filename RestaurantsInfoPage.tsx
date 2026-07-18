import { Button } from '../components/Button';
import { UtensilsCrossed, Calendar, Users, BarChart3, Mail } from 'lucide-react';

interface RestaurantsInfoPageProps {
  onBack: () => void;
}

export function RestaurantsInfoPage({ onBack }: RestaurantsInfoPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-6 h-6 text-blue-600" />
              <span className="font-bold text-lg text-slate-900">
                Restaurant Reservations
              </span>
            </div>
            <Button onClick={onBack} variant="secondary" size="sm">
              Back to Home
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
            Partner With Us
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
            Join our platform and give your customers a seamless booking experience
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-16">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 rounded-2xl mb-4">
              <Calendar className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">
              Real-time Management
            </h3>
            <p className="text-slate-600">
              Manage your reservations, table layouts, and availability in real-time with our intuitive dashboard
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-2xl mb-4">
              <Users className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">
              Grow Your Business
            </h3>
            <p className="text-slate-600">
              Reach more customers and fill more tables with our growing network of diners
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-orange-100 rounded-2xl mb-4">
              <BarChart3 className="w-7 h-7 text-orange-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">
              Analytics & Insights
            </h3>
            <p className="text-slate-600">
              Track bookings, peak times, and customer preferences to optimize your operations
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-purple-100 rounded-2xl mb-4">
              <Mail className="w-7 h-7 text-purple-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">
              Automated Communications
            </h3>
            <p className="text-slate-600">
              Send automatic confirmations and reminders to reduce no-shows
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-slate-600 mb-8 max-w-2xl mx-auto">
            Contact us to learn more about partnering with Restaurant Reservations and bringing your establishment onto our platform
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:info@restaurant-reservations.com"
              className="inline-flex items-center justify-center px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Contact Us
            </a>
            <Button onClick={onBack} variant="secondary" size="lg">
              Browse Restaurants
            </Button>
          </div>
        </div>
      </main>

      <footer className="bg-slate-900 text-white py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-slate-400 text-sm">
            &copy; {new Date().getFullYear()} Restaurant Reservations. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
