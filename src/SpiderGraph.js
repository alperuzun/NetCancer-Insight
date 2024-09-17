import React from 'react';
import {
    Radar, RadarChart, PolarGrid,
    PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend
} from 'recharts';

const SpiderGraph = ({data, isComparative}) => {

    // Sample data
    // const data = [
    //     { name: 'Graph density', x: 21 },
    //     { name: 'Clustering Coefficient', x: 22 },
    //     { name: 'Centralization', x: -32 },
    //     { name: 'D', x: -14 },
    //     { name: 'E', x: -51 },
    //     { name: 'F', x: 16 },
    //     { name: 'G', x: 7 },
    //     { name: 'H', x: -8 },
    //     { name: 'Eccentricity Centrality', x: 9 },
    // ];

    return (
            <RadarChart
                    height={400} width={500}
                            outerRadius="60%" data={data}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="name" fontSize={12} axisLine={false}/>
                    <PolarRadiusAxis angle={45}/>
                    {!isComparative &&
                        <Radar dataKey="x" stroke="blue" fill="blue" fillOpacity={0.6} />}
                    {isComparative && (
                        <>
                            <Radar dataKey="Graph 1" stroke="red" fill="red" fillOpacity={0.4} />
                            <Radar dataKey="Graph 2" stroke="blue" fill="blue" fillOpacity={0.4} />
                            <Legend/>
                        </>
                    )}
                </RadarChart>
    );
}

export default SpiderGraph;