import { useEffect, useRef } from "react";
import { InputAdornment, TextField } from "@mui/material";
import PlaceIcon from "@mui/icons-material/Place";
import { loadGooglePlaces } from "../lib/googlePlaces";

interface PlacesAutocomplete {
  addListener: (event: string, cb: () => void) => void;
  getPlace: () => { formatted_address?: string; name?: string };
}
interface GMaps {
  maps?: { places?: { Autocomplete: new (el: HTMLInputElement, opts: unknown) => PlacesAutocomplete } };
}

/** Address field with Google Places autocomplete (SA-restricted). Falls back
 *  to a plain typed field when no API key is configured. */
export default function AddressAutocomplete({
  value,
  onChange,
  error,
  placeholder,
  accent,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  accent: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let ac: PlacesAutocomplete | null = null;
    loadGooglePlaces().then((ok) => {
      if (!ok || !inputRef.current) return;
      const g = (window as unknown as { google?: GMaps }).google;
      const Auto = g?.maps?.places?.Autocomplete;
      if (!Auto) return;
      ac = new Auto(inputRef.current, { types: ["address"], componentRestrictions: { country: "za" }, fields: ["formatted_address", "name"] });
      ac.addListener("place_changed", () => {
        const place = ac!.getPlace();
        const addr = place.formatted_address || place.name || "";
        if (addr) onChangeRef.current(addr);
      });
    });
    // Google injects its own dropdown; nothing to tear down beyond the listener,
    // which dies with the input element.
  }, []);

  return (
    <TextField
      inputRef={inputRef}
      placeholder={placeholder ?? "Start typing your address…"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fullWidth
      autoFocus
      error={!!error}
      helperText={error}
      slotProps={{ input: { startAdornment: <InputAdornment position="start"><PlaceIcon fontSize="small" sx={{ color: accent }} /></InputAdornment> } }}
      sx={{ mt: 1.5 }}
    />
  );
}
