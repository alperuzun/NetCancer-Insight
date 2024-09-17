from sympy import *

t = symbols('t')
x1 = Function('x1')
x2 = Function('x2')
deq1 = diff(x1(t),t) - 5*x1(t)+1*x2(t)
deq2 = diff(x2(t),t) - 3*x1(t)-1*x2(t)
print(dsolve([deq1,deq2]))