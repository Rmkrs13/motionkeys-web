#!/bin/zsh
# Maakt eenmalig een self-signed code-signing certificaat "MotionKeys Dev" in je login-sleutelhanger.
# Daarna signeert build.sh de app daarmee, en onthoudt macOS de Toegankelijkheid-toestemming
# ook na een rebuild. Je krijgt één macOS-dialoog om je wachtwoord in te geven (vertrouwen van het certificaat).
set -e
NAME="MotionKeys Dev"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -v -p codesigning | grep -q "\"$NAME\""; then
  echo "Certificaat \"$NAME\" bestaat al."
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

/usr/bin/openssl req -x509 -newkey rsa:2048 -days 3650 -nodes \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" \
  -subj "/CN=$NAME" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" \
  -addext "basicConstraints=critical,CA:FALSE" >/dev/null 2>&1

/usr/bin/openssl pkcs12 -export -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 -out "$TMP/cert.p12" -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -passout pass:motionkeys -name "$NAME"

security import "$TMP/cert.p12" -k "$KEYCHAIN" -P motionkeys -T /usr/bin/codesign
security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN" "$TMP/cert.pem"

echo
security find-identity -v -p codesigning | grep "\"$NAME\"" && echo "Klaar. Bouw nu opnieuw met ./build.sh --run"
