import { OnboardingWizard } from "../features/saas-admin/OnboardingWizard";
import { ThemeModeSelect } from "../components/ThemeToggle";

export const SignupPage = (): JSX.Element => {
  return (
    <div className="signup-shell">
      <div className="signup-shell__theme">
        <ThemeModeSelect />
      </div>

      <div className="signup-hero">
        <h1>Launch your pathology lab in 60 seconds</h1>
        <p>White-labeled LIS with NABL-ready reports, billing, and sample tracking.</p>
      </div>

      <OnboardingWizard />
    </div>
  );
};
