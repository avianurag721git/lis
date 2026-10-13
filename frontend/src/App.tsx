import { AppRoutes } from "./routes/AppRoutes";
import { CommandPalette, useCommandPalette } from "./components/CommandPalette";

const App = (): JSX.Element => {
  const { open, setOpen } = useCommandPalette();

  return (
    <>
      <AppRoutes onOpenCommand={() => setOpen(true)} />
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
};

export default App;
