#!/usr/bin/env python3
"""
Prophet 价格预测脚本

从标准输入读取 JSON 格式的历史价格数据，使用 Prophet 模型进行预测，
返回未来 N 天的价格预测结果。
"""

import sys
import json
import pandas as pd
from prophet import Prophet
from datetime import datetime, timedelta

def main():
    try:
        # 从标准输入读取 JSON 数据
        input_data = json.loads(sys.stdin.read())
        
        # 解析输入参数
        historical_data = input_data.get('historical_data', [])
        periods = input_data.get('periods', 30)
        start_date = input_data.get('start_date')
        
        if not historical_data:
            raise ValueError('历史数据不能为空')
        
        # 转换为 DataFrame（Prophet 需要 ds 和 y 列）
        df = pd.DataFrame(historical_data)
        df['ds'] = pd.to_datetime(df['date'])
        df['y'] = df['price']
        df = df[['ds', 'y']].sort_values('ds')
        
        # 初始化 Prophet 模型
        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,  # 机票/酒店通常不需要日季节性
            seasonality_mode='multiplicative',  # 或 'additive'
            changepoint_prior_scale=0.05,  # 趋势变化敏感度
        )
        
        # 拟合模型
        model.fit(df)
        
        # 创建未来日期数据框
        future = model.make_future_dataframe(periods=periods)
        
        # 进行预测
        forecast = model.predict(future)
        
        # 只返回未来日期的预测（排除历史数据）
        if start_date:
            start = pd.to_datetime(start_date)
            future_forecast = forecast[forecast['ds'] >= start].tail(periods)
        else:
            future_forecast = forecast.tail(periods)
        
        # 格式化输出
        result = []
        prev_price = None
        for _, row in future_forecast.iterrows():
            price = round(row['yhat'])
            
            # 判断趋势（与前一个价格对比）
            if prev_price is not None:
                if price > prev_price * 1.02:  # 上涨超过2%
                    trend = 'up'
                elif price < prev_price * 0.98:  # 下跌超过2%
                    trend = 'down'
                else:
                    trend = 'stable'
            else:
                trend = 'stable'
            
            prev_price = price
            
            result.append({
                'date': row['ds'].strftime('%Y-%m-%d'),
                'price': price,
                'lower_bound': round(row['yhat_lower']),
                'upper_bound': round(row['yhat_upper']),
                'trend': trend,
                'confidence': 0.95  # Prophet 默认使用 95% 置信区间
            })
        
        # 输出 JSON 结果
        print(json.dumps({
            'success': True,
            'forecast': result,
            'model_metrics': {
                'mae': None,  # 可以计算但需要实际值
                'mape': None,
            }
        }))
        
    except Exception as e:
        # 输出错误信息
        print(json.dumps({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()

