import React from 'react';
import {
    Radar, RadarChart, PolarGrid,
    PolarAngleAxis, PolarRadiusAxis, Legend
} from 'recharts';

const SpiderGraph = ({data, isComparative}) => {
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