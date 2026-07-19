#!/usr/bin/env bash
set -euo pipefail

mongosh --host mongo:27017 --quiet <<'JS'
try {
  const status = rs.status();
  if (status.ok === 1) quit(0);
} catch (error) {
  if (error.codeName !== 'NotYetInitialized') print(error.message);
}
rs.initiate({
  _id: 'rs0',
  members: [{ _id: 0, host: 'mongo:27017' }]
});
JS

until mongosh --host mongo:27017 --quiet --eval "rs.status().myState" | grep -q '^1$'; do
  echo 'Waiting for MongoDB replica set primary...'
  sleep 2
done
