import React, { useEffect, useState } from 'react';
import api from '../api';

const Occupancy = () => {
  const [data, setData] = useState([]);
  const currentMonth = new Date().getMonth(); // 0-based index (0 = Jan)
  const today = new Date();
  const lowThreshold = 50;
  const highThreshold = 80;

  useEffect(() => {
    api.get('/api/occupancy-report')
      .then(response => setData(response.data))
      .catch(error => console.error('Error fetching occupancy data:', error));
  }, []);

  return (
    <div className="container">
      <h2>Occupancy Report</h2>
      {['Playa del Carmen', 'Tulum'].map(city => {
        const cityUnits = data.filter(item => item.city === city);
        const groupedByUnit = {};

        cityUnits.forEach(item => {
          if (!groupedByUnit[item.unitId]) {
            groupedByUnit[item.unitId] = { unitName: item.unitName };
          }
          groupedByUnit[item.unitId][parseInt(item.month)] = item.occupancy;
        });

        const sortedUnits = Object.entries(groupedByUnit).sort((a, b) =>
          a[1].unitName.localeCompare(b[1].unitName)
        );

        return (
          <div key={city} style={{ marginBottom: '2rem' }}>
            <h3>{city}</h3>
            <div className="table-container">
              <table className="custom-data-table">
                <thead>
                  <tr>
                    <th style={{ fontWeight: 'bold' }}>Unit Name</th>
                    {[
                      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                    ].map((month, idx) => (
                      <th
                        key={month}
                        style={{
                          textAlign: 'center'
                        }}
                      >
                        {month}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedUnits.map(([unitId, months]) => (
                    <tr key={unitId}>
                      <td>{months.unitName || unitId}</td>
                      {Array.from({ length: 12 }, (_, i) => {
                        const monthNum = i + 1;
                        const isCurrentMonth = i === currentMonth;
                        const value = months[monthNum];
                        let backgroundColor;

                        if (isCurrentMonth) {
                          if (value !== undefined) {
                            if (today.getDate() > 15 && (value === 0 || value < lowThreshold)) {
                              backgroundColor = '#FFCDD2'; // light red
                            } else if (value >= highThreshold) {
                              backgroundColor = '#C8E6C9'; // light green
                            }
                          }
                        }

                        return (
                          <td key={monthNum} style={{ backgroundColor }}>
                            {value !== undefined ? `${value.toFixed(0)}%` : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Occupancy;