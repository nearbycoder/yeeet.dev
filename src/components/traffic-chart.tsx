import type { CSSProperties } from 'react'

type TrafficPoint = { date: string; views: number }

function niceCeiling(value: number) {
  if (value <= 4) return 4
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= value) ?? 10
  return step * magnitude
}

function label(date: string, interval: 'day' | 'week') {
  const formatted = new Date(`${date}T00:00:00Z`).toLocaleDateString(
    undefined,
    { month: 'short', day: 'numeric', timeZone: 'UTC' },
  )
  return interval === 'week' ? `Week of ${formatted}` : formatted
}

export function TrafficChart({
  points,
  interval,
}: {
  points: Array<TrafficPoint>
  interval: 'day' | 'week'
}) {
  const peak = Math.max(0, ...points.map((point) => point.views))
  const ceiling = niceCeiling(peak)
  const peakIndex = points.findIndex(
    (point) => point.views === peak && peak > 0,
  )
  const ticks = [ceiling, ceiling / 2, 0]
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))

  return (
    <figure className="traffic-chart">
      <div className="traffic-plot" aria-hidden="true">
        <div className="traffic-grid">
          {ticks.map((tick) => (
            <span key={tick}>
              <b>{tick.toLocaleString()}</b>
            </span>
          ))}
        </div>
        <div
          className="traffic-bars"
          style={{ '--bar-count': points.length } as CSSProperties}
        >
          {points.map((point, index) => (
            <div
              className={`traffic-bar ${index === peakIndex ? 'is-peak' : ''}`}
              key={point.date}
            >
              <i
                style={{
                  height: `${point.views ? Math.max((point.views / ceiling) * 100, 1.5) : 0}%`,
                }}
              />
              {index === peakIndex ? (
                <em
                  style={{ bottom: `${(point.views / ceiling) * 100}%` }}
                  className="traffic-peak"
                >
                  {point.views.toLocaleString()}
                </em>
              ) : null}
              <span className="traffic-tip">
                <b>{point.views.toLocaleString()} views</b>
                {label(point.date, interval)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div
        className="traffic-axis"
        aria-hidden="true"
        style={{ '--bar-count': points.length } as CSSProperties}
      >
        {points.map((point, index) => (
          <span key={point.date}>
            {index % labelEvery === 0 || index === points.length - 1
              ? label(point.date, 'day')
              : ''}
          </span>
        ))}
      </div>
      <details className="traffic-table">
        <summary>Show as table</summary>
        <table className="console-table">
          <thead>
            <tr>
              <th scope="col">{interval === 'week' ? 'Week' : 'Day'} (UTC)</th>
              <th scope="col">Page views</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.date}>
                <td>
                  <time dateTime={point.date}>
                    {label(point.date, interval)}
                  </time>
                </td>
                <td>{point.views.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
