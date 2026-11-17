import { useLocation } from 'react-router-dom';

/** Shows the current URL so tests can assert what's in the address bar. */
export function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}
