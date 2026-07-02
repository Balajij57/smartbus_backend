import dns from 'dns';

const host = 'smartbustraking.su6fm7l.mongodb.net';

dns.resolveSrv(`_mongodb._tcp.${host}`, (err, addresses) => {
  if (err) {
    console.error('Error resolving SRV:', err);
    return;
  }
  console.log('SRV Addresses:', addresses);

  dns.resolveTxt(host, (err, txtRecords) => {
    if (err) {
      console.log('No TXT records or error:', err.message);
    } else {
      console.log('TXT Records:', txtRecords);
    }

    // Print out the reconstructed non-srv URI template
    const hostsList = addresses.map(addr => `${addr.name}:${addr.port}`).join(',');
    
    // Parse TXT records for options
    let options = '';
    if (txtRecords && txtRecords.length > 0) {
      const mergedOpts = txtRecords.flat().join('&');
      if (mergedOpts) {
        options = `?${mergedOpts}`;
      }
    }
    
    console.log('\n--- Reconstructed non-SRV connection string template ---');
    console.log(`mongodb://katabathinaalaji86_db_user:<db_password>@${hostsList}/smartbus${options}`);
  });
});
