import { useState, type FormEvent } from 'react';
import type { Building, Listing } from '../../../lib/apartments/model.ts';
import { AREAS, inAreas } from '../../../lib/apartments/streeteasy.ts';
import { checkBuilding, manualListing, readListingUrl } from '../data.ts';

interface Props {
  onAdd: (listing: Listing, building: Building) => void;
  onClose: () => void;
}

/** Vet a listing you found yourself: paste its StreetEasy link, and the checks run right here. */
export function AddListing({ onAdd, onClose }: Props) {
  const [link, setLink] = useState('');
  const [address, setAddress] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  const [beds, setBeds] = useState('1');
  const [hood, setHood] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = link ? readListingUrl(link) : null;

  const onLink = (value: string) => {
    setLink(value);
    const p = readListingUrl(value);
    if (p?.address) setAddress(p.address);
    if (p?.unit) setUnit(p.unit);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const rent = Number(price.replace(/[$,\s]/g, ''));
    if (!address.trim()) return setError('Add the street address (StreetEasy shows it at the top of the listing).');
    if (!rent) return setError('Add the monthly rent.');
    setBusy(true);
    try {
      const building = await checkBuilding(address.trim(), parsed?.borough);
      if (!building.geo) {
        setError('Couldn’t find that address. Try it the way the city writes it, e.g. “212 East 29th Street”.');
        return;
      }
      const id = parsed?.id ?? `manual-${Date.now().toString(36)}`;
      const url =
        parsed?.url ??
        `https://www.google.com/search?q=${encodeURIComponent(`streeteasy ${address} ${unit ? `#${unit}` : ''}`.trim())}`;
      // Leave the neighborhood to the city's answer when it's one StreetEasy uses too.
      const cityHood = building.geo.neighborhood;
      const neighborhood =
        hood ||
        (cityHood &&
        inAreas(
          cityHood,
          AREAS.map((a) => a.id),
        )
          ? cityHood
          : '');
      onAdd(
        manualListing({
          id,
          url,
          address: address.trim(),
          price: rent,
          ...(unit.trim() ? { unit: unit.trim().replace(/^#/, '').toUpperCase() } : {}),
          beds: Number(beds),
          ...(neighborhood ? { neighborhood } : {}),
        }),
        building,
      );
      onClose();
    } catch (err) {
      setError(`Couldn’t reach the city’s data just now (${(err as Error).message}). Try again in a moment.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add" onSubmit={submit}>
      <div className="add__head">
        <h2>Check a listing</h2>
        <button type="button" className="button button--quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
      <label className="field">
        <span className="field__label">StreetEasy link (optional)</span>
        <input
          value={link}
          onChange={(e) => onLink(e.target.value)}
          placeholder="https://streeteasy.com/building/…"
          inputMode="url"
        />
      </label>
      <div className="place__row">
        <label className="field field--grow">
          <span className="field__label">Address</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="212 East 29th Street" />
        </label>
        <label className="field field--narrow">
          <span className="field__label">Unit</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="7" />
        </label>
      </div>
      <div className="place__row">
        <label className="field field--narrow">
          <span className="field__label">Rent</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="3,400" inputMode="numeric" />
        </label>
        <label className="field field--narrow">
          <span className="field__label">Beds</span>
          <select value={beds} onChange={(e) => setBeds(e.target.value)}>
            <option value="0">Studio</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4+</option>
          </select>
        </label>
        <label className="field field--grow">
          <span className="field__label">Neighborhood</span>
          <select value={hood} onChange={(e) => setHood(e.target.value)}>
            <option value="">Not sure / elsewhere</option>
            {AREAS.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="add__error">{error}</p>}
      <button type="submit" className="button button--primary" disabled={busy}>
        {busy ? 'Checking city records…' : 'Run the checks'}
      </button>
    </form>
  );
}
