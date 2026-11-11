// কোয়াড্রিক এরর (Garland-Heckbert) দিয়ে মেশ সরল করা: আকার ঠিক রেখে ত্রিভুজ কমায়
// stdin: int nv, nt, k, target; float P[nv*3]; float A[nv*k]; uint32 T[nt*3]   stdout: একই গঠন
#include <cstdio>
#include <cstdint>
#include <cmath>
#include <vector>
#include <algorithm>
using namespace std;
struct V3 { double x, y, z; };
static V3 operator-(V3 a, V3 b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
static V3 operator+(V3 a, V3 b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
static V3 operator*(V3 a, double s) { return {a.x * s, a.y * s, a.z * s}; }
static V3 cross(V3 a, V3 b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
static double dot(V3 a, V3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
static double len(V3 a) { return sqrt(dot(a, a)); }
static V3 norm(V3 a) { double l = len(a); return l > 1e-20 ? a * (1 / l) : V3{0, 0, 0}; }
struct Q { double m[10] = {0};
  Q() {}
  Q(double a, double b, double c, double d) { m[0]=a*a; m[1]=a*b; m[2]=a*c; m[3]=a*d; m[4]=b*b; m[5]=b*c; m[6]=b*d; m[7]=c*c; m[8]=c*d; m[9]=d*d; }
  Q operator+(const Q& o) const { Q r; for (int i = 0; i < 10; i++) r.m[i] = m[i] + o.m[i]; return r; }
  Q& operator+=(const Q& o) { for (int i = 0; i < 10; i++) m[i] += o.m[i]; return *this; }
  Q scaled(double s) const { Q r; for (int i = 0; i < 10; i++) r.m[i] = m[i] * s; return r; }
  double err(V3 p) const { double x = p.x, y = p.y, z = p.z;
    return m[0]*x*x + 2*m[1]*x*y + 2*m[2]*x*z + 2*m[3]*x + m[4]*y*y + 2*m[5]*y*z + 2*m[6]*y + m[7]*z*z + 2*m[8]*z + m[9]; }
};
struct Tri { int v[3]; double err[4]; bool del = false, dirty = false; V3 n; };
struct Vert { V3 p; Q q; int ts = 0, tc = 0; bool border = false; };
struct Ref { int t, j; };
int K; vector<Vert> vs; vector<Tri> ts; vector<Ref> refs; vector<float> A;

static double edgeErr(int a, int b, V3& out, double& tpar) {
  Q q = vs[a].q + vs[b].q;
  bool bd = vs[a].border && vs[b].border;
  double det = q.m[0]*(q.m[4]*q.m[7]-q.m[5]*q.m[5]) - q.m[1]*(q.m[1]*q.m[7]-q.m[5]*q.m[2]) + q.m[2]*(q.m[1]*q.m[5]-q.m[4]*q.m[2]);
  V3 p1 = vs[a].p, p2 = vs[b].p, pm = (p1 + p2) * 0.5;
  double best;
  if (fabs(det) > 1e-15 && !bd) {
    // সর্বোত্তম বিন্দু (৩×৩ সমাধান)
    double inv = 1 / det;
    double x = -inv*( q.m[3]*(q.m[4]*q.m[7]-q.m[5]*q.m[5]) - q.m[1]*(q.m[6]*q.m[7]-q.m[5]*q.m[8]) + q.m[2]*(q.m[6]*q.m[5]-q.m[4]*q.m[8]) );
    double y =  inv*( q.m[0]*(q.m[6]*q.m[7]-q.m[8]*q.m[5]) - q.m[3]*(q.m[1]*q.m[7]-q.m[5]*q.m[2]) + q.m[2]*(q.m[1]*q.m[8]-q.m[6]*q.m[2]) );
    double z = -inv*( q.m[0]*(q.m[4]*q.m[8]-q.m[5]*q.m[6]) - q.m[1]*(q.m[1]*q.m[8]-q.m[6]*q.m[2]) + q.m[3]*(q.m[1]*q.m[5]-q.m[4]*q.m[2]) );
    V3 o = {x, y, z};
    V3 e = p2 - p1; double el = dot(e, e);
    double t = el > 0 ? dot(o - p1, e) / el : 0.5;
    // কিনারা থেকে বেশি দূরে গেলে বিশ্বাস করা যায় না: তখন তিন বিন্দুর ভালোটা
    double tc = min(1.0, max(0.0, t));
    V3 onSeg = p1 + e * tc; double perp = len(o - onSeg);
    // কিনারার বাইরে বা কিনারা থেকে লম্বা দূরে গেলে (পাতলা জিনিসে বিন্দু ছিটকে যায়) বিশ্বাস করা যায় না
    if (t > -0.15 && t < 1.15 && perp < 0.35 * sqrt(el)) { out = o; tpar = tc; return q.err(o); }
  }
  double e1 = q.err(p1), e2 = q.err(p2), e3 = q.err(pm);
  best = min(e1, min(e2, e3));
  if (best == e1) { out = p1; tpar = 0; } else if (best == e2) { out = p2; tpar = 1; } else { out = pm; tpar = 0.5; }
  return best;
}
static bool flipped(V3 p, int i0, int i1, vector<char>& del) {
  Vert& v = vs[i0];
  for (int k = 0; k < v.tc; k++) {
    Tri& t = ts[refs[v.ts + k].t];
    if (t.del) continue;
    int s = refs[v.ts + k].j, id1 = t.v[(s + 1) % 3], id2 = t.v[(s + 2) % 3];
    if (id1 == i1 || id2 == i1) { del[k] = 1; continue; }
    V3 d1 = norm(vs[id1].p - p), d2 = norm(vs[id2].p - p);
    if (fabs(dot(d1, d2)) > 0.999) return true;
    V3 n = norm(cross(d1, d2));
    del[k] = 0;
    if (dot(n, t.n) < 0.25) return true;
  }
  return false;
}
static void updateTris(int i0, Vert& v, vector<char>& del, int& dc) {
  V3 p; double tp;
  for (int k = 0; k < v.tc; k++) {
    Ref& r = refs[v.ts + k]; Tri& t = ts[r.t];
    if (t.del) continue;
    if (del[k]) { t.del = true; dc++; continue; }
    t.v[r.j] = i0; t.dirty = true;
    t.err[0] = edgeErr(t.v[0], t.v[1], p, tp); t.err[1] = edgeErr(t.v[1], t.v[2], p, tp); t.err[2] = edgeErr(t.v[2], t.v[0], p, tp);
    t.err[3] = min(t.err[0], min(t.err[1], t.err[2]));
    refs.push_back(r);
  }
}
static void updateMesh(int iter) {
  if (iter > 0) { size_t d = 0; for (size_t i = 0; i < ts.size(); i++) if (!ts[i].del) ts[d++] = ts[i]; ts.resize(d); }
  for (auto& v : vs) { v.ts = 0; v.tc = 0; }
  for (auto& t : ts) for (int j = 0; j < 3; j++) vs[t.v[j]].tc++;
  int s = 0; for (auto& v : vs) { v.ts = s; s += v.tc; v.tc = 0; }
  refs.assign(ts.size() * 3, {0, 0});
  for (size_t i = 0; i < ts.size(); i++) for (int j = 0; j < 3; j++) { Vert& v = vs[ts[i].v[j]]; refs[v.ts + v.tc] = {(int)i, j}; v.tc++; }
  if (iter == 0) {
    // কিনারা খোঁজা (একটা মাত্র ত্রিভুজের প্রান্ত): ছিদ্র, টেক্সচারের সেলাই, আলাদা অংশের ধার
    vector<int> vc, vid;
    for (auto& v : vs) v.border = false;
    vector<Q> extra(vs.size());
    for (size_t i = 0; i < vs.size(); i++) {
      Vert& v = vs[i]; vc.clear(); vid.clear();
      for (int k = 0; k < v.tc; k++) { Tri& t = ts[refs[v.ts + k].t];
        for (int j = 0; j < 3; j++) { int id = t.v[j]; size_t o = 0; while (o < vid.size() && vid[o] != id) o++; if (o == vid.size()) { vid.push_back(id); vc.push_back(1); } else vc[o]++; } }
      for (size_t o = 0; o < vid.size(); o++) if (vc[o] == 1) vs[vid[o]].border = true;
    }
    for (auto& v : vs) v.q = Q();
    for (auto& t : ts) {
      V3 p0 = vs[t.v[0]].p, p1 = vs[t.v[1]].p, p2 = vs[t.v[2]].p;
      V3 c = cross(p1 - p0, p2 - p0); double area = len(c) * 0.5; V3 n = norm(c); t.n = n;
      Q q(n.x, n.y, n.z, -dot(n, p0)); q = q.scaled(area + 1e-12);
      for (int j = 0; j < 3; j++) vs[t.v[j]].q += q;
    }
    // কিনারার উপর লম্ব তল জুড়ে দেওয়া: সীমানা নড়ে না
    for (auto& t : ts) for (int j = 0; j < 3; j++) {
      int a = t.v[j], b = t.v[(j + 1) % 3];
      if (!(vs[a].border && vs[b].border)) continue;
      // এই প্রান্ত আর কোনো ত্রিভুজে আছে কিনা
      int cnt = 0; Vert& va = vs[a];
      for (int k = 0; k < va.tc; k++) { Tri& u = ts[refs[va.ts + k].t]; for (int m = 0; m < 3; m++) if (u.v[m] == b) cnt++; }
      if (cnt != 1) continue;
      V3 e = vs[b].p - vs[a].p; double el = len(e); V3 pn = norm(cross(e, t.n));
      Q q(pn.x, pn.y, pn.z, -dot(pn, vs[a].p)); q = q.scaled(el * el * 1000);
      extra[a] += q; extra[b] += q;
    }
    for (size_t i = 0; i < vs.size(); i++) vs[i].q += extra[i];
    V3 p; double tp;
    for (auto& t : ts) { t.err[0] = edgeErr(t.v[0], t.v[1], p, tp); t.err[1] = edgeErr(t.v[1], t.v[2], p, tp); t.err[2] = edgeErr(t.v[2], t.v[0], p, tp); t.err[3] = min(t.err[0], min(t.err[1], t.err[2])); }
  }
}
int main() {
  int nv, nt, target;
  if (fread(&nv, 4, 1, stdin) != 1) return 1;
  fread(&nt, 4, 1, stdin); fread(&K, 4, 1, stdin); fread(&target, 4, 1, stdin);
  vector<float> P(nv * 3); A.resize((size_t)nv * K); vector<uint32_t> T(nt * 3);
  fread(P.data(), 4, P.size(), stdin); if (K) fread(A.data(), 4, A.size(), stdin); fread(T.data(), 4, T.size(), stdin);
  // মাপ ১-এ আনা (থ্রেশহোল্ড মাপের উপর নির্ভর করে)
  double mn[3] = {1e30, 1e30, 1e30}, mx[3] = {-1e30, -1e30, -1e30};
  for (int i = 0; i < nv; i++) for (int c = 0; c < 3; c++) { mn[c] = min(mn[c], (double)P[i*3+c]); mx[c] = max(mx[c], (double)P[i*3+c]); }
  double S = max(mx[0]-mn[0], max(mx[1]-mn[1], mx[2]-mn[2])); if (S <= 0) S = 1;
  vs.resize(nv);
  for (int i = 0; i < nv; i++) vs[i].p = {(P[i*3]-mn[0])/S, (P[i*3+1]-mn[1])/S, (P[i*3+2]-mn[2])/S};
  for (int i = 0; i < nt; i++) { Tri t; for (int j = 0; j < 3; j++) t.v[j] = T[i*3+j]; if (t.v[0]!=t.v[1] && t.v[1]!=t.v[2] && t.v[0]!=t.v[2]) ts.push_back(t); }
  int dc = 0, start = ts.size();
  vector<char> d0, d1;
  for (int iter = 0; iter < 120; iter++) {
    if ((int)ts.size() - dc <= target) break;
    if (iter % 5 == 0) { updateMesh(iter); dc = 0; }
    for (auto& t : ts) t.dirty = false;
    double thr = 1e-9 * pow(iter + 3.0, 7.0);
    for (size_t i = 0; i < ts.size(); i++) {
      Tri& t = ts[i];
      if (t.err[3] > thr || t.del || t.dirty) continue;
      for (int j = 0; j < 3; j++) {
        if (t.err[j] > thr) continue;
        int i0 = t.v[j], i1 = t.v[(j + 1) % 3];
        Vert &v0 = vs[i0], &v1 = vs[i1];
        if (v0.border != v1.border) continue;
        V3 p; double tp; edgeErr(i0, i1, p, tp);
        d0.assign(v0.tc, 0); d1.assign(v1.tc, 0);
        if (flipped(p, i0, i1, d0) || flipped(p, i1, i0, d1)) continue;
        v0.p = p; v0.q += v1.q;
        for (int c = 0; c < K; c++) { float& a = A[(size_t)i0*K+c]; a = a * (1 - tp) + A[(size_t)i1*K+c] * tp; }
        int tstart = refs.size();
        updateTris(i0, v0, d0, dc); updateTris(i0, v1, d1, dc);
        int tcount = refs.size() - tstart;
        if (tcount <= v0.tc) { for (int k = 0; k < tcount; k++) refs[v0.ts + k] = refs[tstart + k]; }
        else v0.ts = tstart;
        v0.tc = tcount;
        break;
      }
      if ((int)ts.size() - dc <= target) break;
    }
  }
  // জমা করে লেখা
  vector<int> remap(nv, -1); vector<uint32_t> To; int on = 0;
  for (auto& t : ts) if (!t.del) for (int j = 0; j < 3; j++) { int v = t.v[j]; if (remap[v] < 0) remap[v] = on++; To.push_back(remap[v]); }
  vector<float> Po(on * 3), Ao((size_t)on * K);
  for (int i = 0; i < nv; i++) if (remap[i] >= 0) { int o = remap[i];
    Po[o*3] = vs[i].p.x * S + mn[0]; Po[o*3+1] = vs[i].p.y * S + mn[1]; Po[o*3+2] = vs[i].p.z * S + mn[2];
    for (int c = 0; c < K; c++) Ao[(size_t)o*K+c] = A[(size_t)i*K+c]; }
  int ont = To.size() / 3;
  fwrite(&on, 4, 1, stdout); fwrite(&ont, 4, 1, stdout); fwrite(&K, 4, 1, stdout); fwrite(&target, 4, 1, stdout);
  fwrite(Po.data(), 4, Po.size(), stdout); if (K) fwrite(Ao.data(), 4, Ao.size(), stdout); fwrite(To.data(), 4, To.size(), stdout);
  fprintf(stderr, "simp %d -> %d tris\n", start, ont);
  return 0;
}
